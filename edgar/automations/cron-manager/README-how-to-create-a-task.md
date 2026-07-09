# Como criar uma task (Node.js ou Python)

O cron-manager orquestra **toda** task da mesma forma: lê `task.config.yaml` e
importa `index.js` **no mesmo processo**, chamando `export default (context)`.
É o `index.js` que recebe `inputs`, `saveArtifact`, `runPrompt`, `track`/`flow`.

Duas runtimes disponíveis, escolhidas no `create-task`:

```
Node task     runner → import(index.js) → sua lógica roda ali mesmo (in-process)
Python task   runner → import(index.js) → index.js dá spawn de `uv run main.py`
                                            (subprocesso) → devolve o resultado
```

> O campo `entrypoint` no YAML é **informativo** — o runner sempre roda `index.js`.
> Numa task Python, esse `index.js` é uma **ponte fina** (`lib/py-bridge.js`); a
> lógica de verdade fica em `main.py`, 100% desacoplada do cron-manager.

Use este guia para os dois casos comuns:

- **[A. Node.js — task simples](#a-nodejs--task-simples-sem-ia)** (sem IA)
- **[B. Node.js — task com IA](#b-nodejs--task-com-ia-prompt-template)** (`runPrompt` + schema)
- **[C. Python — task com `uv`](#c-python--task-com-uv)**

---

## Passo 0 — Criar a task e escolher o runtime

```bash
cd edgar/automations/cron-manager
node cron-manager.js create-task minha-task
```

O CLI pergunta:

- **Runtime**: `Node.js` ou `Python`
- **Description**, **Allow manual run?**, **Allow cron run?**, **Cron expression**
- (só no Node) **Include prompt template scaffold?** — se `Y`, pede o **Prompt template name**

Isso já cria os arquivos certos pro runtime escolhido — os próximos passos são
só **editar** o que foi gerado.

---

## A. Node.js — task simples (sem IA)

Gerado por `create-task` → Runtime **Node.js** → "Include prompt template scaffold?" **N**.

```
tasks/minha-task/task.config.yaml
tasks/minha-task/index.js
```

1. **`task.config.yaml`** — declare `env_vars`, `inputs`, `artifacts`.
2. **`index.js`** — sua lógica:

```js
export default async function (context) {
  const { inputs, env, saveArtifact } = context;

  console.log(`Processando: ${inputs.termo}`); // vira log da run
  const data = await fazerAlgo(inputs.termo, env.MINHA_API_KEY);

  await saveArtifact("result", data); // artifacts/minha-task/result.json
}
```

3. **Testar**:

```bash
node cron-manager.js doctor
node cron-manager.js run minha-task
```

`context` traz: `inputs`, `env`, `saveArtifact`, `taskName`, `mode`,
`executionId`, `track`/`flow`, e `runPrompt` (só quando um prompt template é
selecionado — ver seção B).

---

## B. Node.js — task com IA (prompt template)

Gerado por `create-task` → Runtime **Node.js** → "Include prompt template scaffold?" **Y**.
Exemplo abaixo: task `news-report` que gera um briefing de notícias com IA e
salva o resultado como artifact.

### Passo 1 — Criar a task

```bash
node cron-manager.js create-task news-report
```

Responda:

- **Runtime**: `Node.js`
- **Description**: `Generate a news briefing using AI`
- **Allow manual run?**: `Y`
- **Allow cron run?**: `Y`
- **Cron expression**: deixa vazio (enter)
- **Include prompt template scaffold?**: `Y`
- **Prompt template name**: `summarize-news`

O comando cria automaticamente todos os arquivos necessários:

```
tasks/news-report/task.config.yaml
tasks/news-report/index.js
tasks/news-report/prompt_templates/summarize-news/prompt.template.config.yaml
tasks/news-report/prompt_templates/summarize-news/system.md
tasks/news-report/prompt_templates/summarize-news/user.md
tasks/news-report/prompt_templates/summarize-news/schema.js
```

Os próximos passos consistem em **editar** esses arquivos gerados para o seu caso de uso.

### Passo 2 — Editar o `task.config.yaml`

```yaml
schema_version: 1

name: news-report
description: Generate a news briefing using AI
created_at: "2026-04-02"
allow_manual: true
allow_cron: true
entrypoint: node index.js
working_dir: ./tasks/news-report

env_vars:
  common:
    - name: OPENAI_API_KEY
      required: true
      help_tip: OpenAI API key

inputs:
  - name: topic
    type: string
    required: true
    help_tip: Topic for the news briefing (e.g. "artificial intelligence")
  - name: max_items
    type: number
    required: false
    default: 3
    help_tip: Maximum number of items in the briefing

artifacts:
  - name: briefing
    description: AI-generated news briefing
    template: summarize-news
    path: briefing.json
```

### Passo 3 — Editar `prompt.template.config.yaml`

```yaml
schema_version: 1

name: summarize-news
description: Generate a structured news briefing on a given topic

provider: openai
model: gpt-4o-mini

system_prompt_file: system.md
user_prompt_file: user.md

inputs:
  - name: style
    type: string
    required: false
    default: formal
    help_tip: Writing style — formal or casual

options:
  temperature: 0.7
  max_tokens: 800
  timeout_ms: 30000
  max_retries: 2

# Output structure is defined in schema.js — não precisa descrever aqui.
```

### Passo 4 — Editar `system.md` e `user.md`

`system.md` define o papel da IA:

```markdown
You are a professional news editor. Your job is to produce concise, accurate news briefings.
```

`user.md` é o prompt de fato:

```markdown
You are a news editor. Write a briefing about the topic below.

Topic: {{topic}}
Number of items: {{max_items}}
Style: {{style}}
Date: {{date_today}}

Write {{max_items}} news items about "{{topic}}" in a {{style}} tone.
Each item must have a short headline and a 1-2 sentence summary.
```

> `{{topic}}` e `{{max_items}}` vêm dos inputs da task (task.config.yaml).
> `{{style}}` vem dos inputs do template (prompt.template.config.yaml).
> `{{date_today}}` é passada pelo `index.js` via `runPrompt({ date_today: ... })`.
> A estrutura do output (campos esperados) é definida em `schema.js` — não em texto no prompt.

### Passo 5 — Editar `schema.js`

O `schema.js` tem **dois propósitos**: é enviado à API como `json_schema` (a API
**garante** que o response vai ter essa estrutura) e também valida o resultado
com Zod como camada de segurança.

```js
import { z } from "zod";

export default z.object({
  topic: z.string(),
  style: z.string(),
  items: z.array(
    z.object({
      headline: z.string(),
      summary: z.string(),
    }),
  ),
  generated_at: z.string(),
});
```

### Passo 6 — Editar o `index.js`

```js
export default async function (context) {
  const { inputs, runPrompt, saveArtifact } = context;

  console.log(`Generating news briefing for topic: "${inputs.topic}"`);
  console.log(`Requesting ${inputs.max_items} items...`);

  // Pass extra variables to the prompt at call time
  const { artifact, model } = await runPrompt({
    date_today: new Date().toISOString().slice(0, 10),
  });

  console.log("--- Briefing received ---");
  console.log(`Topic: ${artifact.topic}`);
  console.log(`Style: ${artifact.style}`);
  console.log(`Items: ${artifact.items.length}`);

  for (const item of artifact.items) {
    console.log(`\n• ${item.headline}`);
    console.log(`  ${item.summary}`);
  }

  // Save as artifact so other tasks can consume it
  await saveArtifact("briefing", artifact);

  console.log(`\nModel used: ${model}`);
  console.log("Done!");
}
```

### Passo 7 — Configurar a env var

```bash
# Opção A: .env na raiz do cron-manager
echo 'OPENAI_API_KEY=sk-...' >> .env

# Opção B: exportar no shell
export OPENAI_API_KEY=sk-...
```

### Passo 8 — Testar

```bash
# Valida tudo (task + template)
node cron-manager.js doctor

# Preview sem chamar a API
node cron-manager.js run news-report --dry-run
node cron-manager.js run news-report --template summarize-news --dry-run

# Rodar com seleção interativa do template
node cron-manager.js run news-report

# Rodar passando o template direto
node cron-manager.js run news-report --template summarize-news

# Ver artifact salvo
node cron-manager.js list-artifacts

# Ver detalhes da task (mostra templates + artifacts)
node cron-manager.js inspect news-report
```

Fluxo esperado ao rodar:

1. O CLI pergunta o `topic` (required) e o `max_items` (default 3)
2. O CLI pergunta qual template usar (ou confirma `summarize-news` se passado com `--template`)
3. O CLI pergunta o `style` (input do template, default `formal`)
4. A task executa: chama `runPrompt({ date_today: "..." })`
5. O resultado é impresso e salvo em `artifacts/news-report/briefing.json`
6. `list-artifacts` mostra o arquivo com a data de modificação

---

## C. Python — task com `uv`

### Escolha do ambiente: por task, não um env global

Cada task Python é isolada — nada de venv único compartilhado em `/tasks`
(acumula conflito de deps e acopla tasks sem relação entre si). O `uv` tem
cache global com hardlinks, então N ambientes por task quase não pesam:

| Caso                 | Como                                          | Arquivos no diretório                                  |
| -------------------- | --------------------------------------------- | ------------------------------------------------------ |
| Task simples         | **PEP 723 inline** + `uv run main.py`         | só `main.py` com header `# /// script` declarando deps |
| Task com muitas deps | **projeto uv**                                | `main.py` + `pyproject.toml` + `uv.lock`               |
| Utilitários comuns   | pacote `tasks/common-py` como path dependency | —                                                      |

Comece com PEP 723 — dá pra migrar pra `pyproject.toml` depois sem tocar no `index.js`.

### Passo 1 — Criar a task

```bash
node cron-manager.js create-task minha-task-py
```

Responda **Runtime: Python**. Gera:

```
tasks/minha-task-py/task.config.yaml
tasks/minha-task-py/index.js     ← ponte (não precisa editar)
tasks/minha-task-py/main.py      ← sua lógica
```

### Passo 2 — Editar `task.config.yaml`

Igual ao Node: declare `env_vars`, `inputs`, `artifacts`. As env vars vão pro
`os.environ` do Python automaticamente (o runner já carregou os `.env` no
`process.env`, herdado pelo subprocesso).

### Passo 3 — Editar `main.py`

Adicione deps no header PEP 723 e escreva a lógica:

```python
# /// script
# requires-python = ">=3.11"
# dependencies = ["httpx"]      # ← suas libs aqui
# ///
import json, os, sys

def emit_result(data):           # devolve JSON pro index.js (→ saveArtifact)
    sys.stdout.write("__TASK_RESULT__" + json.dumps(data) + "\n")
    sys.stdout.flush()

def main():
    payload = json.load(sys.stdin)           # { inputs, taskName, mode, executionId }
    inputs = payload["inputs"]
    print("processando...")                   # print() vira log da run
    result = {"ok": True}
    emit_result(result)

if __name__ == "__main__":
    main()
```

**Protocolo `main.py` ↔ `index.js`** (via `lib/py-bridge.js`):

- **stdin**: JSON `{ inputs, taskName, mode, executionId }`
- **stdout**: cada `print()` vira linha de log; a linha `__TASK_RESULT__<json>` vira o resultado
- **stderr**: capturado no log (tracebacks aparecem)
- **erro**: `raise` → exit ≠ 0 → a task falha

### Passo 4 — Configurar a env var

```bash
cp tasks/minha-task-py/.env.template tasks/minha-task-py/.env  # se existir
# edite tasks/minha-task-py/.env com sua chave
```

### Passo 5 — Testar

```bash
node cron-manager.js doctor
node cron-manager.js run minha-task-py

# debug do main.py isolado, sem o cron-manager:
echo '{"inputs":{}}' | uv run tasks/minha-task-py/main.py
```

### Precisa de IA numa task Python?

`runPrompt` é nativo do Node. Chame no `index.js` (lado Node) e passe o
resultado pro Python no payload, ou faça a chamada de IA direto em Python com a
lib do provider — a ponte não repassa `runPrompt` pro Python.

### Migrar de PEP 723 → projeto uv

Quando as deps crescerem: `cd tasks/minha-task-py && uv init --script main.py`,
ou crie um `pyproject.toml` + `uv.lock` manualmente. O `index.js` não muda —
`uv run main.py` usa o `pyproject.toml` do diretório automaticamente.

### Exemplo real: `youtube-nichos`

Task Python que estima quantos vídeos foram publicados por nicho nos últimos N
dias (YouTube Data API v3). Veja [tasks/youtube-nichos/](tasks/youtube-nichos/):

- `main.py` — deps `["google-api-python-client"]` no header PEP 723
- `task.config.yaml` — env `YOUTUBE_API_KEY`, inputs `nichos`/`days`/`max_results`
- `index.js` — a ponte padrão gerada pelo `create-task`

```bash
cp tasks/youtube-nichos/.env.template tasks/youtube-nichos/.env  # cole sua chave
node cron-manager.js run youtube-nichos --mode cron  # usa os defaults, sem prompts
```

Resultado salvo em `artifacts/youtube-nichos/result.json`.
