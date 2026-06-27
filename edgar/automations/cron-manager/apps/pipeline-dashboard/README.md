# Pipeline Dashboard

Web dashboard for the news pipeline (rss-fetcher → rss-picker → write-article → publish-article).

It reads the existing `cron-manager.db` (SQLite) observability tables. Browsing is read-only and safe to run alongside the cron jobs. There are two **destructive admin actions** exposed as POST-only endpoints (buttons in the header): **🧹 Limpar &gt;7d** (prune old rows) and **🗑️ Zerar banco** (wipe everything). Put the dashboard behind auth (e.g. nginx basic auth) before exposing it.

By default it binds to `127.0.0.1` only (set `DASHBOARD_HOST=0.0.0.0` to expose directly, not recommended). Point it at a different DB file with `CRON_MANAGER_DB=/path/to.db`.

## Run

```bash
cd edgar/automations/cron-manager
node apps/pipeline-dashboard/server.js
# → http://localhost:4500   (set DASHBOARD_PORT to change)
```

## Terminal alternative (no browser)

On the VPS where cron runs, you can get the same funnel / stuck items / recent errors
without port-forwarding:

```bash
node cron-manager.js pipeline            # all groups
node cron-manager.js pipeline -g visto-americano
```

## What it shows

- **Funil** — how many items reached each step (`fetch`/`pick`/`write`/`publish`/`index`) and how many are `ok` / `skipped` / `failed`. This answers "where does the pipeline get stuck".
- **Itens** — current state of every tracked item per group; click a row for the full **timeline** (every step attempt, with error stack and metadata).
- **Erros recentes** — latest failure events across all steps, with message.
- **Execuções recentes** — task-level run history from the `runs` table.

## Where the data comes from

Each pipeline stage emits best-effort events via `context.track(...)` (see `lib/tracker.js`),
persisted to three tables created by `lib/db.js`:

- `pipeline_items` — one row per news item (`item_id` = sha1 of the real URL, stable across all stages).
- `step_events` — append-only event log (one row per step attempt/outcome, with `error_stack` + `meta_json`).
- `item_state` — latest step/status snapshot per item (drives the items table).

Tracking is best-effort: if the DB is unavailable, stages log a warning and keep running — the JSON
artifacts remain the source of truth for the data itself.

## API (JSON)

Read: `/api/groups`, `/api/funnel?group=`, `/api/items?group=`, `/api/item?id=`, `/api/stuck`, `/api/errors`, `/api/runs`.
Write (POST only): `/api/prune?days=7`, `/api/wipe`.

## Maintenance & weekly cleanup

Prune rows + log files older than N days (also a CLI command, for the cron):

```bash
node cron-manager.js prune-tracking --days 7   # delete tracking rows + logs >7d
node cron-manager.js wipe-tracking             # wipe everything (asks to confirm; -y to skip)
```

Weekly cron (Sundays 04:00), with flock so it never overlaps a running task:

```cron
0 4 * * 0 cd /home/edgar/Repos/openclaw/edgar/automations/cron-manager && flock -n /tmp/prune-tracking.lock node cron-manager.js prune-tracking --days 7 >> /tmp/prune-tracking.log 2>&1
```
