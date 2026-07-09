# cron-manager

Modular task automation manager for Node.js — create isolated tasks, run them manually or on a cron schedule, track history, and monitor reliability metrics.

> Para criar tasks, pode usar essa [thread de claude](https://claude.ai/chat/c756e573-2198-4dcb-b670-7465deb68e1c) que já tem o contexto de como criar uma task em cron-manager

---

## Requirements

- Node.js ≥ 16
- npm

## Installation

```bash
cd automations/cron-manager
npm install
chmod +x index.js
npm link          # makes `cron-manager` available globally
```

---

## Commands

```
cron-manager create-task <name>          Create a new task from template
cron-manager remove-task <task>          Delete a task folder (with confirmation)
cron-manager run <task>                  Execute a task manually
cron-manager run <task> --dry-run        Preview without executing
cron-manager run <task> --watch          Re-run automatically on file changes
cron-manager schedule <task>             Prompt for a cron expression and start scheduler
cron-manager list                        Show all tasks with last-run status
cron-manager history <task>              Show execution history
cron-manager history <task> --failed     Show only failed runs
cron-manager stats                       Show aggregate metrics for all tasks
cron-manager stats <task>                Show detailed metrics for one task
cron-manager export-logs <task>          Export run history to stdout (JSON)
cron-manager export-logs <task> --format csv --output runs.csv
```

---

## Creating a task

> ⚠️ Esta seção e a "task.config.yaml reference" / "task index.js reference"
> abaixo descrevem uma arquitetura antiga (module.exports, allow_scheduled,
> pasta `commands/`) e estão desatualizadas. Guia atual, com Node.js **e**
> Python: [README-how-to-create-a-task.md](README-how-to-create-a-task.md).

```bash
cron-manager create-task my-task
```

This creates:

```
tasks/my-task/
  task.config.yaml   # task metadata, inputs, env vars, retry, timeout
  index.js           # your task logic
```

Edit `task.config.yaml` and implement your logic in `index.js`.

---

## task.config.yaml reference

```yaml
name: my-task
description: What this task does
author: edgar
created_at: 2026-01-01
tags: []

allow_manual: true # allow `cron-manager run`
allow_scheduled: true # allow `cron-manager schedule`
allow_periodic: true

entrypoint: node index.js
working_dir: ./tasks/my-task

timeout_seconds: 60 # abort after this many seconds (leave blank for none)

retry:
  max_retries: 3 # number of retry attempts after first failure
  delay_seconds: 10 # base delay between retries
  backoff: exponential # linear | exponential

env_vars:
  common: [MY_VAR] # required in all contexts
  manual: [] # required only for manual runs
  scheduled: [] # required only for scheduled runs
  periodic: []

inputs:
  - name: target
    type: string # string | boolean | number | date
    required: true
    description: Target to process
  - name: limit
    type: number
    required: false
    default: 100
```

---

## task index.js reference

```js
module.exports = async function runTask(context) {
  // context.taskName  — task name string
  // context.config    — full parsed task.config.yaml
  // context.env       — resolved env vars (object)
  // context.inputs    — validated inputs (object)
  // context.mode      — "manual" | "scheduled" | "periodic"

  const limit = context.inputs?.limit ?? 100;
  const apiKey = context.env.MY_API_KEY;

  // your logic here — throw to signal failure
};
```

---

## Example tasks

### hello-world

The minimal starter task. Run with:

```bash
cron-manager run hello-world
```

### cleanup-tmp

Deletes old `.tmp` files from a target directory.

```bash
# Dry run (default — safe to run)
CLEANUP_TARGET_DIR=/tmp cron-manager run cleanup-tmp

# Live delete
CLEANUP_TARGET_DIR=/tmp CLEANUP_CONFIRM=true cron-manager run cleanup-tmp

# Preview config and inputs
cron-manager run cleanup-tmp --dry-run
```

### example-fetch

Fetches a URL and prints the response. Demonstrates timeout (10s) and exponential retry (2 attempts).

```bash
cron-manager run example-fetch
```

---

## Scheduling

```bash
cron-manager schedule cleanup-tmp
# → Enter cron expression: 0 2 * * *
# → Confirm: yes
# Scheduler starts and runs cleanup-tmp every day at 2am.
# Press Ctrl+C to stop.
```

Schedules are persisted to SQLite (`schedules` table). The scheduler runs in the current process — for persistent background scheduling, run inside `tmux`, `screen`, or a process manager like `pm2`.

---

## Watch mode (development)

```bash
cron-manager run my-task --watch
```

Re-runs the task every time you save a file inside `tasks/my-task/`. Useful for rapid iteration during development.

---

## Observability

```bash
# Execution history
cron-manager history my-task
cron-manager history my-task --failed

# Aggregate metrics (success rate, avg/min/max duration)
cron-manager stats
cron-manager stats my-task

# Export to file for external analysis
cron-manager export-logs my-task --format csv --output my-task-runs.csv
cron-manager export-logs my-task --format json --output my-task-runs.json
```

---

## Project structure

```
automations/cron-manager/
│
├── index.js                  CLI entry point (commander)
├── db.js                     All SQLite logic (sql.js, zero native deps)
├── package.json
├── cron-manager.db           Auto-created SQLite database
│
├── templates/core/
│   ├── task.config.yaml      Template with placeholders
│   └── index.js              Template task entrypoint
│
├── commands/
│   ├── create-task.js        Scaffold new task from template
│   ├── remove-task.js        Delete task folder with confirmation
│   ├── run-task.js           Execute task (+ dry-run, watch)
│   ├── schedule-task.js      Interactive cron scheduler
│   ├── list-tasks.js         Table of all tasks + last run
│   ├── history-task.js       Execution log viewer
│   ├── stats-task.js         Aggregate metrics
│   └── export-logs.js        JSON / CSV export
│
├── utils/
│   ├── task-loader.js        Finds, loads, and caches tasks
│   ├── validator.js          Config and input type validation
│   ├── env-resolver.js       Env var resolution by context
│   ├── retry-runner.js       Linear / exponential retry
│   ├── timeout-runner.js     Promise-based timeout wrapper
│   └── logger.js             Colored CLI output + table renderer
│
└── tasks/
    ├── hello-world/          Minimal starter example
    ├── cleanup-tmp/          Filesystem cleanup example
    └── example-fetch/        HTTP fetch example (needs internet)
```

---

## Database schema

```sql
-- Every task execution is logged here
CREATE TABLE runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  task          TEXT NOT NULL,
  timestamp     TEXT NOT NULL,
  status        TEXT NOT NULL,       -- "success" | "failed"
  duration_ms   INTEGER,
  error_message TEXT
);

-- Persisted cron schedules
CREATE TABLE schedules (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  task            TEXT NOT NULL UNIQUE,
  cron_expression TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  active          INTEGER DEFAULT 1
);
```

---

## Adding a new command

1. Create `commands/my-command.js` and export an async function.
2. Wire it into `index.js` with `program.command(...)`.
3. If it needs the DB, call `await initDb()` before the handler runs.

> The architecture is intentionally flat — no framework magic, just plain modules.
