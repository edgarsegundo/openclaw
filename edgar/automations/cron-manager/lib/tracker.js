import { upsertItem, recordStepEvent, upsertItemState, getItemStepStatus } from "./db.js";
import logger from "./logger.js";

/**
 * Best-effort observability tracker injected into each task's context.
 *
 * Tasks emit per-item, per-step events here; the runner persists them to the
 * SQLite tracking tables. Everything is wrapped so a tracking failure NEVER
 * propagates into the pipeline — at worst we log a warning and move on. The
 * JSON artifacts remain the source of truth for the data itself; this layer is
 * purely for visibility ("where did it get stuck, and why").
 */
export function createTracker({ taskName, executionId }) {
  /**
   * Record one step outcome for an item (or a task-level event when itemId is
   * omitted).
   *
   * @param {object} p
   * @param {string} [p.itemId]   Stable id from itemIdFromUrl (omit for task-level)
   * @param {string} [p.group]    Pipeline group, e.g. "visto-americano"
   * @param {string} p.step       'fetch'|'pick'|'write'|'publish'|'index'|'task:<name>'
   * @param {string} p.status     'started'|'ok'|'skipped'|'failed'|'retrying'
   * @param {number} [p.attempt]  Retry attempt number (1-based)
   * @param {string} [p.reason]   Human reason for skip/dedup/low-score
   * @param {string} [p.title]    Item title (stored on first sighting)
   * @param {string} [p.url]      Item url (stored on first sighting)
   * @param {Error|string} [p.error]  Error to capture (message + stack)
   * @param {object} [p.meta]     Extra structured payload (score, cost, site_id…)
   */
  function track({ itemId, group, step, status, attempt, reason, title, url, error, meta }) {
    try {
      const now = new Date().toISOString();
      const errMessage = error ? (error.message ?? String(error)) : null;
      const errStack = error && error.stack ? error.stack : null;

      if (itemId) {
        upsertItem({
          item_id: itemId,
          group_name: group ?? null,
          title: title ?? null,
          url: url ?? null,
          first_seen: now,
        });
      }

      recordStepEvent({
        item_id: itemId ?? null,
        group_name: group ?? null,
        execution_id: executionId,
        step,
        status,
        attempt: attempt ?? 1,
        reason: reason ?? null,
        error_message: errMessage,
        error_stack: errStack,
        meta_json: meta ? safeStringify(meta) : null,
        created_at: now,
      });

      // Maintain the "current state" snapshot only for real items and only for
      // terminal-ish statuses (not the noisy 'started'/'retrying' transitions).
      if (itemId && status !== "started" && status !== "retrying") {
        upsertItemState({
          item_id: itemId,
          group_name: group ?? null,
          current_step: step,
          current_status: status,
          last_error: errMessage,
          updated_at: now,
        });
      }
    } catch (err) {
      // Tracking must never break the pipeline.
      logger.warn(`[tracker] failed to record event (${taskName}/${step}): ${err.message}`);
    }
  }

  /**
   * Record one EXECUTION-LEVEL flow checkpoint (a fundamental phase of the task,
   * not tied to a single news item). These power the per-run flow modal in the
   * dashboard.
   *
   * Stored in the same `step_events` table but under a `flow.<key>` step name so
   * they never pollute the item funnel (which only counts fetch/pick/write/...).
   * Ordering in the modal is by insert order (step_events.id), so just call this
   * in the order the phases actually run.
   *
   * @param {string} key     Flow step key — must match lib/flows.js (e.g. "ai_triage")
   * @param {string} [status] 'ok'|'skipped'|'failed'|'started' (default 'ok')
   * @param {object} [meta]   Relevant context vars to surface (counts, cost, ids…)
   * @param {object} [opts]
   * @param {string} [opts.reason]      Human reason (e.g. "below_min_items")
   * @param {Error|string} [opts.error] Error to capture (message + stack)
   */
  function flow(key, status = "ok", meta = null, opts = {}) {
    track({
      step: `flow.${key}`,
      status,
      meta: meta ?? undefined,
      reason: opts.reason,
      error: opts.error,
    });
  }

  /**
   * Idempotency helper: has this item already completed the given step OK?
   * Best-effort — returns false if the lookup fails for any reason.
   */
  function hasCompleted(itemId, group, step) {
    try {
      return getItemStepStatus(itemId, group, step) === "ok";
    } catch (err) {
      logger.warn(`[tracker] hasCompleted lookup failed: ${err.message}`);
      return false;
    }
  }

  return { track, flow, hasCompleted };
}

function safeStringify(obj) {
  try {
    return JSON.stringify(obj);
  } catch {
    return null;
  }
}
