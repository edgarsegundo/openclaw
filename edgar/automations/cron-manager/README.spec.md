# SPEC v2 — Cron Manager

## Runtime oficial de automações do projeto

---

# 1. Objetivo

O **cron-manager** é o app oficial para criação e execução padronizada de automações.

Responsabilidades:

- criar tasks via CLI interativa;
- gerar estrutura padrão de arquivos;
- validar configuração YAML;
- executar tasks manualmente (com prompts dinâmicos);
- permitir execução por cron do Linux (sem prompts);
- registrar histórico de execuções em SQLite;
- manter logs organizados por task.

---

## Filosofia

O `cron-manager` **não é um scheduler interno nem um daemon**.

É um processo **one-shot**: nasce, roda UMA task, registra resultado, morre.

O agendamento oficial é feito pelo **cron do Linux**.

---

## Fluxo oficial

```text
Manual:   usuário → node cron-manager.js run my-task → prompts → task → resultado → fim
Cron:     Linux cron → node cron-manager.js run my-task --mode cron → defaults → task → resultado → fim
```

---

## Modelo de execução: chamada direta

A task é importada e chamada **no mesmo processo** (sem child_process.spawn no runner).

Justificativa: o cron-manager é one-shot. Se a task travar ou crashar, o processo morre — e o cron do Linux criará um novo na próxima execução. Timeout é garantido via `Promise.race`.

> **Exceção — tasks Python**: o runner sempre importa `index.js` no mesmo processo,
> como acima. Para rodar lógica em Python, o **próprio `index.js` da task** (não o
> runner) dá `spawn` de `uv run main.py` via `lib/py-bridge.js`. O timeout/retry do
> runner seguem envolvendo essa chamada normalmente. Veja
> [README-how-to-create-a-task.md](README-how-to-create-a-task.md).

---

# 2. Tecnologias e runtime

- **Node.js** (ESM — import/export, extensão .js)
- **better-sqlite3** para persistência (síncrono, nativo)
- **commander** para CLI
- **inquirer** para prompts interativos
- **js-yaml** para parsing de YAML
- **chalk** para output colorido

---

# 3. Estrutura do projeto

```
automations/cron-manager/
│
├── bin/
│   └── cron-manager.js          CLI entry point (commander)
│
├── lib/
│   ├── runner.js                Carrega task, prompts, execução, timeout, retry
│   ├── validator.js             Validação de config YAML e inputs por tipo
│   ├── logger.js                Output colorido + formatação de tabelas
│   └── db.js                    SQLite (better-sqlite3), schema, queries
│
├── templates/
│   ├── task.config.yaml         Template YAML com placeholders
│   └── index.js                 Template de task entrypoint
│
├── tasks/                       Tasks criadas pelo usuário
│   └── <task-name>/
│       ├── task.config.yaml
│       └── index.js
│
├── logs/                        Logs de execução por task
│   └── <task-name>/
│       └── <timestamp>_<id>.log
│
├── cron-manager.db              SQLite auto-criado (gitignored)
├── package.json
├── .gitignore
└── README.md
```

---

# 4. Schema oficial de task.config.yaml

```yaml
schema_version: 1

name: my-task
description: What this task does
author: edgar
created_at: 2026-04-02
tags: []

allow_manual: true
allow_cron: true

cron_suggestion: "0 3 * * *"

entrypoint: node index.js
working_dir: ./tasks/my-task

timeout_seconds: 60

retry:
  max_retries: 3
  delay_seconds: 10
  backoff: exponential # linear | exponential

env_vars:
  common:
    - name: API_TOKEN
      required: true
      help_tip: Token required for all modes
  manual:
    - name: LOG_LEVEL
      required: false
      default: info
      help_tip: Logging level for manual run
  cron: []

inputs:
  - name: user
    type: string
    required: true
    default:
    help_tip: User to process
  - name: date
    type: date
    required: false
    default: "2026-01-01"
    help_tip: Reference date (YYYY-MM-DD)
  - name: verbose
    type: boolean
    required: false
    default: false
    help_tip: Enable detailed logs
```

### Campos opcionais com defaults

| Campo             | Default quando ausente |
| ----------------- | ---------------------- |
| `timeout_seconds` | sem timeout            |
| `retry`           | sem retry              |
| `cron_suggestion` | vazio                  |
| `tags`            | `[]`                   |
| `env_vars.manual` | `[]`                   |
| `env_vars.cron`   | `[]`                   |

---

# 5. Contrato obrigatório de task (index.js)

Cada task exporta uma função async que recebe `context`:

```js
export default async function (context) {
  // context.taskName    — nome da task (string)
  // context.config      — task.config.yaml parseado
  // context.env         — env vars resolvidas (object)
  // context.inputs      — inputs validados (object)
  // context.mode        — "manual" | "cron"
  // context.executionId — UUID da execução
  // lógica aqui
  // throw para sinalizar falha
}
```

---

# 6. CLI — Comandos

## create-task

```bash
node cron-manager.js create-task <name>
```

### Fluxo interativo obrigatório

```text
Description (optional):
> Backup do banco principal

Allow manual run? (Y/n):
> y

Allow cron run? (Y/n):
> y

Cron expression (optional):
> 0 3 * * *
```

### Validação de cron expression

Se informada, validar sintaxe antes de aceitar.
Se inválida: `Invalid cron expression. Please try again.`
Se vazia: task criada sem cron_suggestion.

### Arquivos gerados

```
tasks/<name>/
  task.config.yaml    ← preenchido com respostas do prompt
  index.js            ← template padrão
```

### Saída final

```text
✔ Task created: backup-db

Files created:
  - tasks/backup-db/task.config.yaml
  - tasks/backup-db/index.js
```

Se houver cron_suggestion, exibir também:

```text
Suggested crontab entry:

0 3 * * * cd /absolute/path && node cron-manager.js run backup-db --mode cron
```

Path absoluto via `process.cwd()`.

---

## run

```bash
node cron-manager.js run <task>
node cron-manager.js run <task> --mode cron
node cron-manager.js run <task> --dry-run
```

### Modo manual (default)

1. Carregar `task.config.yaml`
2. Verificar `allow_manual: true`
3. Resolver env vars (common + manual) — avisar se faltam obrigatórias
4. Gerar prompts dinâmicos para cada input
5. Validar respostas por tipo
6. Aplicar defaults quando vazio
7. Montar contexto
8. Executar task (com timeout + retry se configurados)
9. Registrar resultado no DB
10. Salvar log em arquivo

### Prompts dinâmicos por tipo

| Tipo      | Prompt                                      |
| --------- | ------------------------------------------- |
| `string`  | Input textual simples                       |
| `number`  | Input numérico (validar que é número)       |
| `boolean` | `(y/N)` ou `(Y/n)` conforme default         |
| `date`    | Input textual, validar formato `YYYY-MM-DD` |

Regras:

- Campo `required: true` sem default → não aceita vazio
- Campo com `default` → mostrar `[default]` no prompt, aceitar enter vazio
- `help_tip` → exibido como label do prompt

### Modo cron

1. Carregar `task.config.yaml`
2. Verificar `allow_cron: true`
3. Resolver env vars (common + cron)
4. **Nunca abrir prompts**
5. Inputs obrigatórios devem vir do `default` no YAML
6. Se faltar obrigatório sem default: falhar imediatamente com mensagem clara
7. Executar task, registrar resultado, salvar log

### Modo dry-run

1. Validar config YAML
2. Resolver env vars e reportar quais faltam
3. Listar inputs com tipos, required, defaults
4. Imprimir resumo (entrypoint, working_dir, timeout, retry)
5. **Não executar a task**

---

## list

```bash
node cron-manager.js list
```

Saída:

```text
TASK            LAST RUN              STATUS
backup-db       2026-04-02 03:00:05   success
cleanup-tmp     2026-04-01 14:30:12   failure
my-new-task     —                     —
```

---

## history

```bash
node cron-manager.js history <task>
node cron-manager.js history <task> --failed
```

Mostra últimas N execuções (default: 20).
Com `--failed`, filtra apenas status `failure`.

---

## inspect

```bash
node cron-manager.js inspect <task>
```

Mostra:

- Config resolvida (YAML parseado)
- cron_suggestion
- Env vars (common + manual + cron)
- Inputs com tipos e defaults
- Última execução (se houver)

---

## doctor

```bash
node cron-manager.js doctor
```

Valida:

- Tasks com YAML inválido
- Tasks com arquivos faltando (index.js)
- DB acessível
- Env vars obrigatórias ausentes

---

# 7. Timeout e Retry

### Timeout

Via `Promise.race`. Se `timeout_seconds` não estiver no YAML, sem timeout.

```js
Promise.race([
  taskFn(context),
  new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), seconds * 1000)),
]);
```

### Retry

Se `retry` estiver no YAML:

- `max_retries`: número de tentativas após primeira falha
- `delay_seconds`: intervalo base entre tentativas
- `backoff: linear` → delay fixo
- `backoff: exponential` → delay \* 2^attempt

Se `retry` estiver ausente: sem retry.

---

# 8. Banco de dados (SQLite)

### Engine

`better-sqlite3` (síncrono, nativo).

### Arquivo

`cron-manager.db` (auto-criado, gitignored).

### Schema

```sql
CREATE TABLE IF NOT EXISTS runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  task          TEXT NOT NULL,
  execution_id  TEXT NOT NULL,
  started_at    TEXT NOT NULL,
  finished_at   TEXT,
  duration_ms   INTEGER,
  status        TEXT NOT NULL,
  error_message TEXT
);
```

### Status válidos

`success` | `failure`

### Encapsulamento

Todo SQL fica em `lib/db.js`. Nenhuma query fora desse módulo.

Funções exportadas:

- `initDb()` — abre conexão, cria tabelas se necessário
- `insertRun({ task, execution_id, started_at, finished_at, duration_ms, status, error_message })`
- `getLastRun(task)` — última execução
- `getHistory(task, limit)` — últimas N execuções
- `getFailedHistory(task, limit)` — últimas N falhas
- `getAllTaskNames()` — tasks distintas com execuções

---

# 9. Logs em arquivo

### Estrutura

```
logs/
  backup-db/
    2026-04-02T03-00-00_abc123.log
```

### Conteúdo mínimo

- execution_id
- timestamp de início
- modo (manual/cron)
- stdout da task
- stderr da task (se houver)
- resultado final (success/failure + duração)

### Captura

Redirecionar `console.log`/`console.error` durante a execução da task para o arquivo de log (além de exibir no terminal em modo manual).

---

# 10. .gitignore

```
cron-manager.db
logs/
node_modules/
```

---

# 11. Dependências (package.json)

```json
{
  "name": "cron-manager",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "better-sqlite3": "latest",
    "chalk": "latest",
    "commander": "latest",
    "inquirer": "latest",
    "js-yaml": "latest"
  }
}
```

---

# 12. Ordem de implementação

1. `package.json` + `.gitignore`
2. `templates/` (task.config.yaml + index.js)
3. `lib/logger.js`
4. `lib/validator.js`
5. `lib/db.js`
6. `lib/runner.js`
7. `cron-manager.js` (CLI wiring)
8. Comando `create-task`
9. Comando `run` (manual + cron + dry-run)
10. Comando `list`
11. Comando `history`
12. Comando `inspect`
13. Comando `doctor`

---

# 13. Resumo de decisões

| Decisão            | Escolha                                  |
| ------------------ | ---------------------------------------- |
| Formato de config  | YAML                                     |
| Engine de DB       | better-sqlite3                           |
| Modelo de execução | Chamada direta (não spawn)               |
| Módulo system      | ESM (import/export, .js)                 |
| Scheduler          | Linux cron (não interno)                 |
| Modos de execução  | manual / cron                            |
| Contrato da task   | `export default async function(context)` |
| Timeout            | Promise.race                             |
| Retry              | linear / exponential backoff             |
| Prompts            | inquirer (dinâmicos, baseados no YAML)   |
| Logs               | Arquivos em `logs/<task>/`               |
