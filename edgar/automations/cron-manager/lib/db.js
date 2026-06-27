import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Default to the repo DB, but allow an override so the dashboard/tests can point
// at a copy or temp DB instead of the live one (CRON_MANAGER_DB=/path/to.db).
const DB_PATH = process.env.CRON_MANAGER_DB || path.join(__dirname, "..", "cron-manager.db");

let _db = null;

/**
 * Open SQLite connection and ensure schema exists.
 */
export function initDb() {
  if (_db) {
    return _db;
  }

  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");

  _db.exec(`
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

    CREATE TABLE IF NOT EXISTS pipeline_items (
      item_id      TEXT NOT NULL,
      group_name   TEXT NOT NULL,
      title        TEXT,
      url          TEXT,
      first_seen   TEXT NOT NULL,
      PRIMARY KEY (item_id, group_name)
    );

    CREATE TABLE IF NOT EXISTS step_events (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id       TEXT,
      group_name    TEXT,
      execution_id  TEXT,
      step          TEXT NOT NULL,
      status        TEXT NOT NULL,
      attempt       INTEGER DEFAULT 1,
      reason        TEXT,
      error_message TEXT,
      error_stack   TEXT,
      meta_json     TEXT,
      created_at    TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_step_events_item ON step_events(item_id, group_name);
    CREATE INDEX IF NOT EXISTS idx_step_events_exec ON step_events(execution_id);
    CREATE INDEX IF NOT EXISTS idx_step_events_created ON step_events(created_at);

    CREATE TABLE IF NOT EXISTS item_state (
      item_id        TEXT NOT NULL,
      group_name     TEXT NOT NULL,
      current_step   TEXT NOT NULL,
      current_status TEXT NOT NULL,
      last_error     TEXT,
      updated_at     TEXT NOT NULL,
      PRIMARY KEY (item_id, group_name)
    );
  `);

  return _db;
}

/**
 * Insert a new execution record.
 */
export function insertRun({
  task,
  execution_id,
  started_at,
  finished_at,
  duration_ms,
  status,
  error_message,
}) {
  const db = initDb();
  db.prepare(`
    INSERT INTO runs (task, execution_id, started_at, finished_at, duration_ms, status, error_message)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    task,
    execution_id,
    started_at,
    finished_at ?? null,
    duration_ms ?? null,
    status,
    error_message ?? null,
  );
}

/**
 * Get the most recent run for a task.
 */
export function getLastRun(task) {
  const db = initDb();
  return (
    db.prepare("SELECT * FROM runs WHERE task = ? ORDER BY started_at DESC LIMIT 1").get(task) ??
    null
  );
}

/**
 * Get the last N runs for a task.
 */
export function getHistory(task, limit = 20) {
  const db = initDb();
  return db
    .prepare("SELECT * FROM runs WHERE task = ? ORDER BY started_at DESC LIMIT ?")
    .all(task, limit);
}

/**
 * Get the last N failed runs for a task.
 */
export function getFailedHistory(task, limit = 20) {
  const db = initDb();
  return db
    .prepare(
      "SELECT * FROM runs WHERE task = ? AND status = 'failure' ORDER BY started_at DESC LIMIT ?",
    )
    .all(task, limit);
}

/**
 * Get distinct task names that have execution records.
 */
export function getAllTaskNames() {
  const db = initDb();
  return db
    .prepare("SELECT DISTINCT task FROM runs ORDER BY task")
    .all()
    .map((r) => r.task);
}

// ── Pipeline item tracking (observability layer) ─────────────────────────────

/**
 * Register a news item (or refresh its title/url). Idempotent per (item_id, group).
 */
export function upsertItem({ item_id, group_name, title, url, first_seen }) {
  const db = initDb();
  db.prepare(`
    INSERT INTO pipeline_items (item_id, group_name, title, url, first_seen)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(item_id, group_name) DO UPDATE SET
      title = COALESCE(excluded.title, pipeline_items.title),
      url   = COALESCE(excluded.url, pipeline_items.url)
  `).run(item_id, group_name, title ?? null, url ?? null, first_seen);
}

/**
 * Append an immutable step event (one row per attempt/outcome).
 */
export function recordStepEvent({
  item_id,
  group_name,
  execution_id,
  step,
  status,
  attempt,
  reason,
  error_message,
  error_stack,
  meta_json,
  created_at,
}) {
  const db = initDb();
  db.prepare(`
    INSERT INTO step_events
      (item_id, group_name, execution_id, step, status, attempt, reason, error_message, error_stack, meta_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    item_id ?? null,
    group_name ?? null,
    execution_id ?? null,
    step,
    status,
    attempt ?? 1,
    reason ?? null,
    error_message ?? null,
    error_stack ?? null,
    meta_json ?? null,
    created_at,
  );
}

/**
 * Set the current (latest) step/status snapshot for an item.
 */
export function upsertItemState({
  item_id,
  group_name,
  current_step,
  current_status,
  last_error,
  updated_at,
}) {
  const db = initDb();
  db.prepare(`
    INSERT INTO item_state (item_id, group_name, current_step, current_status, last_error, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(item_id, group_name) DO UPDATE SET
      current_step   = excluded.current_step,
      current_status = excluded.current_status,
      last_error     = excluded.last_error,
      updated_at     = excluded.updated_at
  `).run(item_id, group_name, current_step, current_status, last_error ?? null, updated_at);
}

/**
 * Get the latest known state of every item in a group, newest first.
 */
export function getItemsByGroup(group_name, limit = 200) {
  const db = initDb();
  return db
    .prepare(`
      SELECT s.item_id, s.group_name, s.current_step, s.current_status, s.last_error, s.updated_at,
             i.title, i.url, i.first_seen
      FROM item_state s
      LEFT JOIN pipeline_items i ON i.item_id = s.item_id AND i.group_name = s.group_name
      WHERE s.group_name = ?
      ORDER BY s.updated_at DESC
      LIMIT ?
    `)
    .all(group_name, limit);
}

/**
 * Full event timeline for a single item, oldest first.
 */
export function getItemTimeline(item_id) {
  const db = initDb();
  return db.prepare("SELECT * FROM step_events WHERE item_id = ? ORDER BY id ASC").all(item_id);
}

/**
 * Items currently stuck in a failed state.
 */
export function getStuckItems(limit = 100) {
  const db = initDb();
  return db
    .prepare(`
      SELECT s.*, i.title, i.url
      FROM item_state s
      LEFT JOIN pipeline_items i ON i.item_id = s.item_id AND i.group_name = s.group_name
      WHERE s.current_status = 'failed'
      ORDER BY s.updated_at DESC
      LIMIT ?
    `)
    .all(limit);
}

/**
 * Recent failure events across all steps (with stack), newest first.
 */
export function getRecentErrors(limit = 50) {
  const db = initDb();
  return db
    .prepare(`
      SELECT * FROM step_events
      WHERE status = 'failed'
      ORDER BY id DESC
      LIMIT ?
    `)
    .all(limit);
}

/**
 * Funnel counts: how many items reached each step, broken down by status.
 * Counts distinct items per (step,status) so retries don't inflate totals.
 */
export function getStepFunnel(group_name) {
  const db = initDb();
  const where = group_name ? "WHERE group_name = ?" : "";
  const args = group_name ? [group_name] : [];
  return db
    .prepare(`
      SELECT step, status, COUNT(DISTINCT item_id) AS items, COUNT(*) AS events
      FROM step_events
      ${where}
      GROUP BY step, status
    `)
    .all(...args);
}

/**
 * Distinct groups seen in the tracking tables.
 */
export function getAllGroups() {
  const db = initDb();
  return db
    .prepare(
      "SELECT DISTINCT group_name FROM pipeline_items WHERE group_name IS NOT NULL ORDER BY group_name",
    )
    .all()
    .map((r) => r.group_name);
}

/**
 * Latest 'ok' status (if any) for an item at a given step — used for
 * idempotency checks (e.g. skip re-publishing an already-published item).
 */
export function getItemStepStatus(item_id, group_name, step) {
  const db = initDb();
  return (
    db
      .prepare(`
        SELECT status FROM step_events
        WHERE item_id = ? AND group_name = ? AND step = ?
        ORDER BY id DESC LIMIT 1
      `)
      .get(item_id, group_name, step)?.status ?? null
  );
}

/**
 * Recent run records across all tasks, newest first.
 */
export function getRecentRuns(limit = 50) {
  const db = initDb();
  return db.prepare("SELECT * FROM runs ORDER BY started_at DESC LIMIT ?").all(limit);
}

// ── Maintenance: wipe / prune ────────────────────────────────────────────────

/**
 * Delete ALL rows from every tracking table and the run history.
 * Schema (CREATE TABLE) is preserved — only the data is cleared.
 * Returns the number of rows removed per table.
 */
export function wipeAll() {
  const db = initDb();
  const tables = ["step_events", "item_state", "pipeline_items", "runs"];
  const counts = {};
  const tx = db.transaction(() => {
    for (const t of tables) {
      counts[t] = db.prepare(`DELETE FROM ${t}`).run().changes;
    }
  });
  tx();
  return counts;
}

/**
 * Delete tracking/run rows older than `days` days, BUT preserve records for
 * items that completed the full pipeline (have at least one publish:ok event).
 * Those items are kept indefinitely regardless of age.
 * Task-level run records (not tied to an item) are always pruned by age.
 */
export function pruneOlderThan(days = 7) {
  const db = initDb();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const counts = {};

  // Subquery: item_ids that successfully completed the publish step — keep forever.
  const published = `
    SELECT DISTINCT item_id FROM step_events
    WHERE step = 'publish' AND status = 'ok'
  `;

  const tx = db.transaction(() => {
    // step_events: prune old rows, but never touch events belonging to published items.
    // task-level events have item_id = NULL, so they are always eligible for pruning.
    counts.step_events = db
      .prepare(
        `DELETE FROM step_events
         WHERE created_at < ?
         AND (item_id IS NULL OR item_id NOT IN (${published}))`,
      )
      .run(cutoff).changes;

    counts.item_state = db
      .prepare(
        `DELETE FROM item_state
         WHERE updated_at < ?
         AND item_id NOT IN (${published})`,
      )
      .run(cutoff).changes;

    counts.pipeline_items = db
      .prepare(
        `DELETE FROM pipeline_items
         WHERE first_seen < ?
         AND item_id NOT IN (${published})`,
      )
      .run(cutoff).changes;

    // Runs are task-level (not tied to individual items) — prune by age.
    counts.runs = db.prepare("DELETE FROM runs WHERE started_at < ?").run(cutoff).changes;
  });
  tx();
  return { cutoff, counts };
}

/**
 * Close the SQLite connection and release file handles.
 */
export function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}
