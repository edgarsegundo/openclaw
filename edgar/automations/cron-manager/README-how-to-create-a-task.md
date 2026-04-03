# How to create a task (with prompt template)

Este guia cria uma task **do zero** que usa um prompt template para gerar um
relatório com IA e salva o resultado como artifact.

---

## Passo 1 — Criar a task

```bash
cd edgar/automations/cron-manager
node bin/cron-manager.js create-task news-report
```

Responda:

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

---

## Passo 2 — Editar o `task.config.yaml`

Abra `tasks/news-report/task.config.yaml` e ajuste os campos gerados. O arquivo já tem a estrutura completa — edite conforme o seu caso:

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

---

## Passo 3 — Editar `prompt.template.config.yaml`

Abra `tasks/news-report/prompt_templates/summarize-news/prompt.template.config.yaml` e customize:

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

---

## Passo 4 — Editar `system.md` e `user.md`

O `system.md` define o papel da IA. Edite `tasks/news-report/prompt_templates/summarize-news/system.md`:

```markdown
You are a professional news editor. Your job is to produce concise, accurate news briefings.
```

O `user.md` é o prompt de fato. Edite `tasks/news-report/prompt_templates/summarize-news/user.md`:

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

---

## Passo 5 — Editar `schema.js`

O `schema.js` tem **dois propósitos**: é enviado à API como `json_schema` (a API **garante** que o response vai ter essa estrutura) e também valida o resultado com Zod como camada de segurança. Edite `tasks/news-report/prompt_templates/summarize-news/schema.js`:

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

---

## Passo 6 — Editar o `index.js`

Substitua o conteúdo de `tasks/news-report/index.js` por:

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

---

## Passo 7 — Configurar a env var

Adicione sua chave no arquivo `.env` (na raiz do cron-manager), ou exporte no shell:

```bash
# Opção A: .env na raiz do cron-manager
echo 'OPENAI_API_KEY=sk-...' >> .env

# Opção B: exportar no shell
export OPENAI_API_KEY=sk-...
```

---

## Passo 8 — Testar

```bash
# Valida tudo (task + template)
node bin/cron-manager.js doctor

# Preview sem chamar a API
node bin/cron-manager.js run news-report --dry-run
node bin/cron-manager.js run news-report --template summarize-news --dry-run

# Rodar com seleção interativa do template
node bin/cron-manager.js run news-report

# Rodar passando o template direto
node bin/cron-manager.js run news-report --template summarize-news

# Ver artifact salvo
node bin/cron-manager.js list-artifacts

# Ver detalhes da task (mostra templates + artifacts)
node bin/cron-manager.js inspect news-report
```

### Fluxo esperado ao rodar

1. O CLI pergunta o `topic` (required) e o `max_items` (default 3)
2. O CLI pergunta qual template usar (ou confirma `summarize-news` se passado com `--template`)
3. O CLI pergunta o `style` (input do template, default `formal`)
4. A task executa: chama `runPrompt({ date_today: "..." })`
5. O resultado é impresso e salvo em `artifacts/news-report/briefing.json`
6. `list-artifacts` mostra o arquivo com a data de modificação
