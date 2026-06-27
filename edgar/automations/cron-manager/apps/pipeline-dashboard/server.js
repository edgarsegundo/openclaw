import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  initDb,
  getAllGroups,
  getItemsByGroup,
  getItemTimeline,
  getStuckItems,
  getRecentErrors,
  getStepFunnel,
  getRecentRuns,
  wipeAll,
  pruneOlderThan,
} from "../../lib/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.DASHBOARD_PORT) || 4500;
// Bind to loopback by default so the dashboard is only reachable via the local
// reverse proxy (nginx), never directly from the public internet. Override with
// DASHBOARD_HOST=0.0.0.0 only if you intentionally want it exposed.
const HOST = process.env.DASHBOARD_HOST || "127.0.0.1";

// Read-only: we only ever SELECT from the existing cron-manager.db.
initDb();

const STEPS = ["fetch", "pick", "write", "publish", "index"];

function sendJson(res, data) {
  const body = JSON.stringify(data);
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
}

function sendError(res, code, message) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ error: message }));
}

/**
 * Shape the raw funnel rows into one row per step with status breakdown,
 * so the UI can render a left-to-right pipeline.
 */
function buildFunnel(group) {
  const rows = getStepFunnel(group);
  const byStep = Object.fromEntries(
    STEPS.map((s) => [s, { step: s, ok: 0, skipped: 0, failed: 0, started: 0, retrying: 0 }]),
  );
  for (const r of rows) {
    if (!byStep[r.step]) continue; // ignore task:* meta steps in the funnel
    if (byStep[r.step][r.status] !== undefined) {
      byStep[r.step][r.status] = r.items;
    }
  }
  return STEPS.map((s) => byStep[s]);
}

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const route = url.pathname;

    // ── API ──────────────────────────────────────────────────────────────────
    if (route === "/api/groups") {
      return sendJson(res, getAllGroups());
    }
    if (route === "/api/funnel") {
      const group = url.searchParams.get("group") || null;
      return sendJson(res, buildFunnel(group));
    }
    if (route === "/api/items") {
      const group = url.searchParams.get("group");
      if (!group) return sendError(res, 400, "group query param required");
      return sendJson(res, getItemsByGroup(group, 500));
    }
    if (route === "/api/item") {
      const id = url.searchParams.get("id");
      if (!id) return sendError(res, 400, "id query param required");
      return sendJson(res, getItemTimeline(id));
    }
    if (route === "/api/stuck") {
      return sendJson(res, getStuckItems(200));
    }
    if (route === "/api/errors") {
      return sendJson(res, getRecentErrors(100));
    }
    if (route === "/api/runs") {
      return sendJson(res, getRecentRuns(100));
    }

    // ── Destructive maintenance (POST only) ────────────────────────────────────
    if (route === "/api/wipe") {
      if (req.method !== "POST") return sendError(res, 405, "use POST");
      const counts = wipeAll();
      console.log("[dashboard] wipeAll:", JSON.stringify(counts));
      return sendJson(res, { ok: true, counts });
    }
    if (route === "/api/prune") {
      if (req.method !== "POST") return sendError(res, 405, "use POST");
      const days = Number(url.searchParams.get("days")) || 7;
      const result = pruneOlderThan(days);
      console.log("[dashboard] prune:", JSON.stringify(result));
      return sendJson(res, { ok: true, ...result });
    }

    // ── Static index.html ──────────────────────────────────────────────────────
    if (route === "/" || route === "/index.html") {
      const html = fs.readFileSync(path.join(__dirname, "public", "index.html"));
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(html);
    }

    return sendError(res, 404, "not found");
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Pipeline dashboard (read-only) → http://${HOST}:${PORT}`);
});
