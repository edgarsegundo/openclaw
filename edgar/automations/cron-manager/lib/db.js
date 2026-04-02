import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, "..", "cron-manager.db");

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
