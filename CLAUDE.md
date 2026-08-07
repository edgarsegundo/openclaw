# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Context

`openclaw` — the real project root is `edgar/` (an OpenClaw node's home directory) — is a monorepo of Node.js automations that run a content pipeline: RSS feeds are fetched, triaged by AI (Perplexity Sonar) with human approval via Discord, written into articles by AI, and published to external sites managed in the separate `fastvistos/multi-sites` and `microservicesadm` repos. It also hosts unrelated smaller automations (Nubank email parsing, US visa info crawler, a visa REST API, a Vue admin dashboard).

## Tech Stack

- Node.js, ESM (`"type": "module"` everywhere), pnpm workspaces at the `edgar/` root
- `discord.js` — Discord bot (command channel + notifications)
- `better-sqlite3` — local persistence (cron-manager execution history, visa-crawler data)
- `openai` SDK pointed at Perplexity Sonar for AI steps (research, triage, article writing)
- `commander` + `inquirer` — cron-manager's CLI
- `zod` — schema validation for AI structured outputs
- `winston` (+ daily-rotate) — logging across automations
- `fastvistos-dashboard-vue` — Vue 3 + Vuetify + Pinia + Vite admin dashboard (separate subproject with its own lint/build/test)
- `api/` — small Express-less Node API (PM2-managed) serving visa data

## Repository Structure

```
edgar/
├── automations/
│   ├── cron-manager/        # Orchestrator/CLI for all "task" pipelines (see below)
│   ├── visa-crawler/        # Standalone: Sonar-based US visa data crawler → SQLite
│   ├── check-nubank-emails/ # Standalone: IMAP → parses Nubank emails
│   └── ai-client/           # Shared AI client helper
├── channels/discord/        # Discord bot: listens on configured channels, dispatches commands
│   └── commands/            # .apr .del .l1 .l2 .pub .url etc — one file per command
├── api/                     # Visa REST API (PM2 app, port 3099 by default)
├── fastvistos-dashboard-vue/# Vue admin dashboard (independent app, own package.json)
├── skills/                  # OpenClaw skill definitions
├── scripts/, monkeypatches/
└── docs/                    # Operational runbooks (see Documentation below)
```

Inside `automations/cron-manager/`:

```
cron-manager.js       # CLI entrypoint (create-task, run, doctor, list-artifacts, inspect, ...)
lib/                   # runner, db (sqlite), validator, prompt-loader
tasks/<name>/
  task.config.yaml     # inputs, env_vars, artifacts, cron/manual permissions
  index.js             # Node: your logic runs in-process. Python: thin bridge to main.py via uv
  main.py              # (Python tasks only) real logic, isolated per-task w/ PEP 723 or uv project
  prompt_templates/<name>/  # system.md, user.md, schema.js, prompt.template.config.yaml
  inputs/inputs-<slug>.json # per-"group" (Discord channel) configuration
artifacts/<task-name>/ # JSON/MD output written via context.saveArtifact()
templates/              # cron-manager prompt/task templates
apps/pipeline-dashboard/ # small web viewer for cron-manager run history
```

## Important Files

- `edgar/automations/cron-manager/cron-manager.js` — the orchestrator entrypoint; every task is invoked through this.
- `edgar/automations/cron-manager/README-how-to-create-a-task.md` — canonical guide for adding a new task (Node w/o AI, Node w/ AI prompt template, Python via `uv`). Read before creating any task.
- `edgar/docs/CHECKLIST-NOVO-GRUPO-RSS-DISCORD.md` — canonical, code-verified checklist for wiring up a new RSS→Discord→article "group"/channel end to end. This is the single most load-bearing doc in the repo for pipeline work.
- `edgar/channels/discord/bots.config.js` — maps bot tokens to allowed Discord channel IDs. A syntax error here crashes the *entire* bot (all channels), not just one.
- `edgar/channels/discord/dispatcher.js` + `commands/*.js` — command routing; each RSS-pipeline command (`apr`, `del`, `l1`, `l2`, `pub`, `url`) resolves its input file from the **literal Discord channel name**.
- `edgar/automations/cron-manager/tasks/rss-fetcher/`, `rss-picker/`, `write-article/`, `publish-article/` — the four pipeline stages; each has its own `inputs/inputs-<slug>.json` per group, and shared `run-*.sh` scripts with a **hardcoded list of groups**.

## Development Commands

cron-manager (from `edgar/automations/cron-manager/`):
```bash
node cron-manager.js create-task <name>          # scaffold a new task (interactive)
node cron-manager.js doctor                      # validate task/template configs
node cron-manager.js run <task> [--dry-run] [--template <name>] [--mode cron]
node cron-manager.js list-artifacts
node cron-manager.js inspect <task>
```

Discord bot (from `edgar/channels/discord/`):
```bash
node --check bots.config.js   # ALWAYS run before restarting after editing bots.config.js/commands/*.js
node index.js                 # run directly (no hot-reload; production uses pm2 restart discord-bot)
```

API (from `edgar/api/`):
```bash
npm run start                 # local
pm2 start ecosystem.config.js # production, PM2-managed
```

fastvistos-dashboard-vue (from `edgar/fastvistos-dashboard-vue/`):
```bash
npm run dev
npm run build         # type-check + vite build
npm run test:unit      # vitest
npm run lint           # oxlint + eslint --fix
npm run format         # oxfmt
npm run type-check     # vue-tsc --build
```

There is no root-level test/lint/build command — each subproject (`api/`, `automations/cron-manager/`, `fastvistos-dashboard-vue/`, `channels/discord/`) has its own `package.json`.

## Architecture

**cron-manager task protocol**: every task is declared by `task.config.yaml` (inputs, required env vars, artifact declarations, cron/manual permissions) and the runner always executes `index.js` in-process, regardless of the declared `entrypoint` field. For Python tasks, `index.js` is a thin bridge (`lib/py-bridge.js`) that spawns `uv run main.py`, sending `{inputs, taskName, mode, executionId}` on stdin and reading `print()` lines as logs plus a final `__TASK_RESULT__<json>` line as the result. AI-backed tasks call `context.runPrompt(...)`, which renders `system.md`/`user.md` templates and validates the model's structured response against a Zod `schema.js`.

**RSS → Discord → article pipeline** (see `docs/CHECKLIST-NOVO-GRUPO-RSS-DISCORD.md` for the full diagram):
1. `rss-fetcher` pulls feeds per group → `artifacts/rss-fetcher/fetched-items-<slug>-<date>.json`
2. `rss-picker` scores new items with Sonar once `min_items` new items accumulate (below that, posts to Discord only, no AI spend) → `approved-<slug>-<date>.json`; also the only stage besides `publish-article` that reads `discord_webhook_url`
3. Discord channel commands `.l1`/`.apr`/`.del`/`.url` let a human review/approve/reject or manually register a URL — all resolve their input file by the **literal channel name** (`inputs-<channelName>.json`)
4. `write-article` reads approved items, researches with Sonar Pro, writes the article → `artifacts/write-article/<slug>/*.json` + `*.md`
5. `publish-article` (`.l2` lists, `.pub <site_id>` publishes) POSTs to `microservicesadm`'s CMS (`/blog-article`) and triggers site deploy (`/execute-publish-script`)

The Discord channel name, the `"group"` field in every `inputs-<slug>.json`, and the input filename suffix must all be identical (`<slug>`) — this is enforced by code, not convention.

**External dependencies not in this repo**: `microservicesadm` (Django app — creates `business_id` + `blog_topic_slug`, which `publish-article` requires to already exist) and `fastvistos/multi-sites/sites/<site_id>/` (the deployed site referencing the same `business_id`). Both must exist before the publish step will work.

## Development Conventions

- ESM throughout (`import`/`export`, `"type": "module"`); no CommonJS.
- `run-*.sh` scripts for `write-article` and `publish-article` are shared across all groups with a **hardcoded list of groups inside the script** — adding a new group's `inputs-<slug>.json` is not enough; you must also add its line to the relevant `run-*.sh`, or that group silently never runs on cron.
- Task artifacts are written via `context.saveArtifact(name, data)`, landing in `artifacts/<task-name>/`.

## Documentation

- `edgar/docs/CHECKLIST-NOVO-GRUPO-RSS-DISCORD.md` — step-by-step, code-referenced guide for adding a new RSS/Discord/article group. Start here for pipeline work.
- `edgar/docs/DISCORD.novo-canal-mesmo-bot.md` — Discord-side UI steps (channel, permissions, webhook) referenced by the checklist above.
- `edgar/docs/AUTOMATIONS.md` — separate, simpler concept: deterministic non-LLM cron jobs invoked via `openclaw cron add` (distinct from the cron-manager task system).
- `edgar/automations/cron-manager/README-how-to-create-a-task.md` — full guide to creating Node/Python cron-manager tasks, with and without AI prompt templates.
- `edgar/automations/cron-manager/README.spec.md`, `README.artifact.duda.tecnica.md` — additional cron-manager design notes.
- `edgar/channels/discord/README.md` — Discord bot structure and how to add a command.
- `edgar/docs/RSS.Feed.md`, `edgar/docs/SETUP.md`, `edgar/docs/OPENCLAW-*-INSTALL.md`, `edgar/docs/NODES.md` — environment/deployment setup.
- `edgar/automations/visa-crawler/docs/README.md` — visa-crawler architecture (separate from the RSS pipeline).

## Important Notes

- Editing `channels/discord/bots.config.js` or `commands/*.js` requires `pm2 restart discord-bot` — there is no hot-reload — and a syntax error in `bots.config.js` takes down the bot for **all** channels, not just the one being edited. Always `node --check` it first.
- `discord_webhook_url` in `inputs-<slug>.json` is only read by `rss-picker` and `publish-article`; setting it in `rss-fetcher`'s input does nothing.
- `min_items` in `rss-picker`'s input gates AI spend: below it, items just post to Discord without invoking Sonar. Setting it artificially high (e.g. `999`) is a documented trick to test the fetcher without spending on AI.
- Do not edit generated/produced artifacts (`artifacts/**`) or `cron-manager.db` by hand — they're runner output.
