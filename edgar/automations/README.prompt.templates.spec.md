# SPEC — Prompt Templates

## Conceito geral

Uma **task** pode opcionalmente ter uma pasta `prompt_templates/`.

Se existir, o cron-manager detecta os templates disponíveis e pergunta ao usuário qual usar antes de executar a task (ou aceita `--template <nome>` direto pela linha de comando).

Se não existir, a task roda normalmente sem nenhuma mudança de comportamento.

**Princípio fundamental:** o cron-manager **não chama a IA automaticamente**. Ele prepara o contexto e disponibiliza a função `context.runPrompt()`. Quem decide **quando** e **se** chamar é o `index.js` da task. Isso dá controle total ao desenvolvedor — a chamada pode acontecer no início, no meio do fluxo, condicionalmente, ou nunca.

---

## Por que faz sentido junto com o cron-manager

Tasks de automação frequentemente precisam de texto gerado por IA como parte do fluxo:

- gerar um relatório a partir de dados coletados
- analisar uma lista de entradas e produzir um sumário
- criar um rascunho de email/post com base em variáveis do contexto
- classificar ou formatar dados brutos antes de persistir

O cron-manager já gerencia inputs, env vars, execução e histórico. Faz sentido que ele também gerencie a camada de prompt como um artefato versionável da task, não como um hardcode no `index.js`.

---

## Estrutura de pastas

```
tasks/my-task/
  task.config.yaml
  index.js
  .env
  prompt_templates/                  ← opcional
    summarize-results/
      prompt.template.config.yaml
      system.md                      ← system prompt (opcional)
      user.md                        ← prompt do usuário com variáveis {{var}}
      schema.js                      ← Zod schema do artifact (opcional mas recomendado)
    draft-email/
      prompt.template.config.yaml
      user.md
      schema.js
```

Cada template é uma **pasta** com pelo menos `prompt.template.config.yaml` e `user.md`.

Se `schema.js` estiver presente, o runner usa `AIClient.generateStructured()` com validação Zod.
Se ausente, usa `AIClient.generateText()` + `JSON.parse` manual.

---

## Schema: `prompt.template.config.yaml`

```yaml
schema_version: 1

name: summarize-results
description: Summarize collected data and return key findings

provider: openai # openai | perplexity
model: gpt-4o-mini # modelo específico do provider

# Arquivos de prompt (relativos à pasta do template)
system_prompt_file: system.md # opcional — se ausente, nenhum system prompt
user_prompt_file: user.md # obrigatório

# Variáveis que o cron-manager vai perguntar ao usuário para preencher o prompt
# Sintaxe no prompt: {{variable_name}}
inputs:
  - name: topic
    type: string
    required: true
    help_tip: Main topic to summarize
  - name: max_words
    type: number
    required: false
    default: 300
    help_tip: Maximum words in the response

# Configuração da chamada à API (passada para AIClient)
options:
  temperature: 0.7 # 0.0 – 2.0
  max_tokens: 1000
  timeout_ms: 30000 # mapeado para AIClient.timeoutMs
  max_retries: 2 # mapeado para AIClient.maxRetries

# Artifact de saída — sempre JSON
# schema_description é injetado no final do user.md como instrução de formato
# schema.js (se presente na pasta) é o Zod schema para validação pelo AIClient
output:
  schema_description: |
    Return a JSON object with:
    - summary (string): executive summary
    - key_points (array of strings): top 3-5 findings
    - confidence (number 0-1): confidence score
  save_to_file: false # true = salva em logs/<task>/<timestamp>_prompt.md
```

---

## Schema Zod do artifact: `schema.js`

Arquivo opcional mas fortemente recomendado. Se presente, o runner usa `AIClient.generateStructured()`, que valida e auto-repara o JSON antes de retornar.

```js
// prompt_templates/summarize-results/schema.js
import { z } from "zod";

export default z.object({
  summary: z.string(),
  key_points: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});
```

Se `schema.js` **não existir**: usa `AIClient.generateText()` + `JSON.parse` manual. Se o parse falhar, `runPrompt()` lança erro.

---

## Arquivos de prompt

### `user.md`

Texto livre com variáveis entre `{{ }}`:

```
Analyze the following data about {{topic}} and provide a summary in at most {{max_words}} words.

Focus on key trends, anomalies, and actionable insights.

Data:
{{task_data}}
```

> `{{task_data}}` pode ser uma variável do template **ou** uma chave de `context.inputs` da task — veja seção "Variáveis disponíveis".

### `system.md` (opcional)

```
You are a data analyst assistant. Be concise and factual.
```

---

## Variáveis disponíveis nos prompts

O cron-manager mescla três fontes de variáveis na hora de renderizar o prompt:

| Prioridade | Fonte                                       | Exemplo                                       |
| ---------- | ------------------------------------------- | --------------------------------------------- |
| 1 (maior)  | Inputs do template (perguntados ao usuário) | `{{topic}}`                                   |
| 2          | Inputs da task já respondidos               | `{{username}}`, `{{date}}`                    |
| 3 (menor)  | Campos fixos do contexto                    | `{{taskName}}`, `{{mode}}`, `{{executionId}}` |

Qualquer `{{var}}` que não for resolvida gera um aviso — nunca um crash silencioso.

---

## Fluxo completo de execução

```
node bin/cron-manager.js run my-task
node bin/cron-manager.js run my-task --template summarize-results
```

### Passo a passo

1. Runner carrega `task.config.yaml` e `.env`
2. Runner verifica se `prompt_templates/` existe na pasta da task
3. **Se `--template <nome>` foi passado**: carrega esse template e resolve inputs
4. **Se não foi passado e há templates**: lista os disponíveis e pergunta ao usuário qual usar
5. **Se não há templates**: `context.runPrompt` não é injetada; task roda normalmente
6. Se template selecionado: runner carrega `prompt.template.config.yaml` e faz prompts dinâmicos para as variáveis do template
7. Runner injeta `context.runPrompt(extraVars?)` — uma função async pronta para chamar
8. Task (`index.js`) executa e, no momento que quiser, faz `await context.runPrompt()`
9. `runPrompt()` renderiza o prompt, chama a API e retorna o artifact
10. Task usa o resultado e continua sua lógica
11. DB + log registram normalmente

---

## Integração com o `index.js` da task

O cron-manager injeta `context.runPrompt` — uma função async que a task chama quando quiser.

```js
export default async function (context) {
  const { inputs, env, runPrompt } = context;

  // 1. Faz o que precisar antes da IA
  const data = await fetchSomeData(inputs.url);

  // 2. Chama o prompt no momento certo — pode passar variáveis extras
  //    que serão mescladas com as variáveis já coletadas pelo runner
  const result = await runPrompt({ task_data: JSON.stringify(data) });
  //
  // result.artifact  — objeto JSON parseado (schema definido no template)
  // result.template  — nome do template usado
  // result.model     — modelo que respondeu
  // result.usage     — { prompt_tokens, completion_tokens, total_tokens }

  // 3. Usa o artifact e continua o fluxo
  console.log("Summary:", result.artifact.summary);
  await saveReport(result.artifact);
}
```

**Regras:**

- Se a task chamar `runPrompt()` sem nenhum template ter sido selecionado, lança erro claro: `No prompt template selected for this run.`
- `extraVars` passados para `runPrompt({ key: value })` têm prioridade máxima na renderização do prompt — sobrescrevem inputs do template e da task.
- A task pode guardar o resultado e usá-lo em qualquer ponto do fluxo.
- A task **não precisa** chamar `runPrompt()` — pode ignorar mesmo com template selecionado (raro, mas válido).

---

## Output: artifacts

O output da chamada à IA é sempre **JSON**. O template instrui a API sobre o schema esperado via `output.schema_description` — esse output é chamado de **artifact**.

O `schema_description` é injetado automaticamente no final do prompt do usuário como instrução de formato. O cron-manager faz `JSON.parse` da resposta e retorna o objeto em `result.artifact`.

Se o `JSON.parse` falhar, `runPrompt()` lança um erro — nunca retorna string silenciosamente.

```yaml
output:
  schema_description: |
    Return a JSON object with:
    - summary (string): executive summary
    - key_points (array of strings): top 3-5 findings
    - confidence (number 0-1): confidence score
  save_to_file: false # true = salva em logs/<task>/<timestamp>_prompt.md
```

O que `runPrompt()` retorna:

```js
{
  artifact: { ... },   // objeto JSON parseado (shape definido em schema_description)
  template: "summarize-results",
  model: "gpt-4o-mini",
  usage: { prompt_tokens: 312, completion_tokens: 89, total_tokens: 401 }
}
```

---

## Declaração de artifacts no `task.config.yaml`

Uma task que produz artifacts via prompt templates deve declará-los no `task.config.yaml`. Isso permite que **outras tasks descubram e usem esses artifacts como input**.

```yaml
# task.config.yaml
artifacts:
  - name: daily_summary
    description: AI-generated daily summary of collected metrics
    template: summarize-results # qual prompt template produz este artifact
    path: daily_summary.json # caminho relativo a artifacts/<task-name>/

  - name: anomaly_report
    description: Detected anomalies in the dataset
    template: detect-anomalies
    path: anomaly_report.json
```

### Onde os artifacts são salvos

```
cron-manager/
  artifacts/
    data-collector/
      daily_summary.json        ← última versão (sobrescrito a cada run)
      anomaly_report.json
    another-task/
      result.json
```

A pasta `artifacts/` fica na raiz do cron-manager, separada de `logs/` (que são registros de execução) e é gitignored.

O caminho final é sempre: `artifacts/<task-name>/<path declarado no config>`.

### Como o `index.js` salva o artifact

A task é responsável por persistir o artifact quando quiser. O runner injeta `context.saveArtifact(name, data)`:

```js
export default async function (context) {
  const { runPrompt, saveArtifact } = context;

  const result = await runPrompt({ task_data: JSON.stringify(rawData) });

  // Salva o artifact com o nome declarado no task.config.yaml
  // O cron-manager resolve o caminho correto automaticamente
  await saveArtifact("daily_summary", result.artifact);

  console.log("Artifact saved.");
}
```

Se `saveArtifact` for chamado com um nome não declarado em `artifacts:`, o runner avisa mas ainda salva.

---

## Consumo de artifacts de outras tasks

Uma task pode declarar inputs do tipo `artifact` que referenciam artifacts de outras tasks:

```yaml
# another-task/task.config.yaml
inputs:
  - name: previous_summary
    type: artifact
    from_task: data-collector
    artifact: daily_summary
    required: false
    help_tip: Previous day summary from data-collector (used as context)
```

Quando o runner encontra um input `type: artifact`:

1. Localiza `artifacts/data-collector/daily_summary.json`
2. Faz `JSON.parse` do conteúdo
3. Injeta em `context.inputs.previous_summary` como objeto
4. Se o arquivo não existir e `required: true` → falha com mensagem clara
5. Se `required: false` → `context.inputs.previous_summary` === `null`

A task consumidora usa normalmente:

```js
export default async function (context) {
  const { inputs, runPrompt } = context;

  const previousSummary = inputs.previous_summary; // objeto ou null

  const result = await runPrompt({
    context_data: previousSummary
      ? JSON.stringify(previousSummary)
      : "No previous summary available.",
  });
}
```

---

## Comandos CLI relacionados a artifacts

```bash
# Lista todos os artifacts declarados por todas as tasks
node bin/cron-manager.js list-artifacts
```

Saída:

```
TASK             ARTIFACT          FILE                        LAST MODIFIED
data-collector   daily_summary     artifacts/.../daily_...     2026-04-02 03:00
data-collector   anomaly_report    artifacts/.../anomaly_...   —  (never saved)
another-task     result            artifacts/.../result...     2026-04-01 14:30
```

O `inspect` já mostra a seção de artifacts da task inspecionada:

```bash
node bin/cron-manager.js inspect data-collector
```

```
Artifacts:
  → daily_summary   [summarize-results]   artifacts/data-collector/daily_summary.json
  → anomaly_report  [detect-anomalies]    artifacts/data-collector/anomaly_report.json
```

---

## Camada de execução: AIClient

O cron-manager usa o `AIClient` de `edgar/automations/ai-client/ai-client.js` para todas as chamadas à IA. Não existe chamada direta a nenhuma API de provider no código do cron-manager.

### Por que AIClient

- Provider-agnóstico via `aiCallback` — trocar de OpenAI para Perplexity é só trocar o callback
- `generateStructured()` valida o JSON retornado contra um Zod schema
- Auto-reparo automático de JSON quebrado (syntax repair + field repair)
- Retry configurável com backoff
- Timeout via `Promise.race`
- Nunca retorna JSON inválido silenciosamente

### Como o `prompt-runner.js` usa o AIClient

```js
import { AIClient } from "../../ai-client/ai-client.js";

// 1. Monta o aiCallback para o provider configurado no template
function buildAiCallback(provider, model) {
  if (provider === "openai") {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return async ({ prompt, temperature }) => {
      const res = await openai.chat.completions.create({
        model,
        temperature,
        messages: [{ role: "user", content: prompt }],
      });
      return res.choices[0].message.content;
    };
  }
  if (provider === "perplexity") {
    // mesma estrutura, endpoint diferente
  }
  throw new Error(`Unknown provider: ${provider}`);
}

// 2. Cria o AIClient com as opções do template
const ai = new AIClient({
  aiCallback: buildAiCallback(config.provider, config.model),
  defaultTemperature: config.options?.temperature ?? 0.3,
  maxRetries: config.options?.max_retries ?? 2,
  timeoutMs: config.options?.timeout_ms ?? 30000,
});

// 3. Chama generateStructured (se schema.js existir) ou generateText
if (zodSchema) {
  const artifact = await ai.generateStructured({ prompt: renderedPrompt, schema: zodSchema });
} else {
  const text = await ai.generateText({ prompt: renderedPrompt });
  const artifact = JSON.parse(text); // pode falhar — erro claro
}
```

### Dependências adicionais no cron-manager

```json
"zod": "^3.22.0"
```

(já usada pelo `AIClient`, precisa estar no `package.json` do cron-manager)

---

## Env vars dos providers

Cada provider lê a chave do `process.env` (carregado do `.env` da task ou da raiz):

| Provider           | Env var              |
| ------------------ | -------------------- |
| openai             | `OPENAI_API_KEY`     |
| perplexity         | `PERPLEXITY_API_KEY` |
| anthropic (futuro) | `ANTHROPIC_API_KEY`  |

---

## Modo cron + templates

No modo `--mode cron`, a seleção interativa de template não acontece.

**Comportamento:** requer que `--template` seja passado explicitamente na linha de comando. Todos os inputs do template devem ter `default` definido no `prompt.template.config.yaml` — caso contrário, o processo falha com mensagem clara.

```bash
node bin/cron-manager.js run my-task --mode cron --template summarize-results
```

---

## Dry run com template

```bash
node bin/cron-manager.js run my-task --template summarize-results --dry-run
```

Exibe:

- Template escolhido
- Provider + modelo
- Variáveis do template com tipos e valores
- Preview do prompt renderizado (com variáveis substituídas por `[valor]`)
- Estimativa de tokens (se possível)
- **Não faz nenhuma chamada à API**

---

## `inspect` com templates

```bash
node bin/cron-manager.js inspect my-task
```

Passa a listar também os templates disponíveis:

```
Prompt templates:
  → summarize-results  [openai / gpt-4o-mini]  2 inputs
  → draft-email        [perplexity / sonar]     3 inputs
```

---

## `doctor` com templates

Valida por template:

- `prompt.template.config.yaml` presente e válido
- `user_prompt_file` existe
- `system_prompt_file` existe (se declarado)
- Provider reconhecido
- Env var do provider presente

---

## Estrutura do lib (implementação)

```
lib/
  prompt-loader.js     Detecta e lista templates disponíveis em uma task
  prompt-render.js     Substitui {{vars}} nos arquivos .md do prompt
  prompt-runner.js     Orquestra: seleção → inputs → prepara context.runPrompt()

  (sem prompt-caller.js — AIClient cobre essa camada)
```

Depêndencia externa (relativa):

```
automations/ai-client/ai-client.js   ← importado por prompt-runner.js
```

### O que `prompt-runner.js` faz no runner (antes da task executar)

1. Detecta se há `prompt_templates/` na task
2. Resolve qual template usar (`--template` arg ou seleção interativa)
3. Carrega o config + faz prompts dos inputs do template
4. Monta a função `runPrompt(extraVars?)` e injeta em `context`
5. A task recebe `context` com `runPrompt` pronto para chamar

### O que `runPrompt(extraVars?)` faz quando chamada pelo `index.js`

1. Mescla variáveis: `extraVars` > inputs do template > inputs da task > campos fixos
2. Renderiza `user.md` e `system.md` com as variáveis mescladas
3. Avisa sobre qualquer `{{var}}` não resolvida (sem crash)
4. Chama a API do provider
5. Faz `JSON.parse` da resposta → artifact
6. Retorna `{ artifact, template, model, usage }`

---

## Possíveis evoluções (não nesta versão)

- **Chaining**: output do template A vira input do template B
- **Versionamento de artifacts**: além do `latest`, manter histórico com timestamp em `artifacts/<task>/history/`
- **Cache de prompt**: salvar resposta por hash dos inputs para evitar chamadas repetidas
- **Fallback de provider**: se OpenAI falhar, tenta Perplexity
- **Template inheritance**: um template base com `extends: base-template`
- **Few-shot examples**: seção `examples:` no config para adicionar exemplos ao prompt
- **Streaming**: stream a resposta da IA em tempo real no terminal
- **Anthropic / Gemini**: adicionar mais providers conforme necessidade

---

## Decisões de arquitetura

| #   | Questão                           | Decisão                                                                                                                                      |
| --- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Templates globais vs por task     | **Por task apenas** — cada task tem seus próprios templates em `prompt_templates/`                                                           |
| 2   | Prompt inline vs arquivos `.md`   | **Arquivos separados** — `user.md` / `system.md`, mais fácil de editar em IDEs                                                               |
| 3   | Um ou múltiplos templates por run | **Um template por execução** — para múltiplos, usa runs separados                                                                            |
| 4   | Cron mode + templates             | **Opção B** — `--template` obrigatório no cron, todos os inputs precisam de `default`                                                        |
| 5   | Output format                     | **Sempre JSON** — `schema_description` guia o modelo; `schema.js` (Zod) valida via `AIClient.generateStructured()`                           |
| 6   | Quem chama a IA                   | **O `index.js` da task** — via `await context.runPrompt(extraVars?)` no momento que quiser                                                   |
| 7   | Camada de chamada à API           | **AIClient** (`ai-client/ai-client.js`) — provider-agnóstico, retry, auto-repair, timeout incluídos                                          |
| 8   | Persistência de artifacts         | **Sempre em `artifacts/<task>/<name>.json`** — sobrescreve a cada run, gitignored, consumido por outras tasks via `type: artifact` em inputs |
