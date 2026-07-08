import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  initDb,
  getAllGroups,
  getItemsByGroup,
  setItemFavorite,
  setItemComment,
  deleteItem,
  getItemTimeline,
  getStepEventById,
  getStuckItems,
  getRecentErrors,
  getStepFunnel,
  getRecentRuns,
  getRunByExecutionId,
  getEventsByExecution,
  getBadFeeds,
  getAiCostsByGroup,
  getAiCostsTimeline,
  getRecentItems,
  wipeAll,
  pruneOlderThan,
} from "../../lib/db.js";
import { getFlow, FLOWS } from "../../lib/flows.js";
import * as cheerio from "cheerio";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Two levels up from apps/pipeline-dashboard → cron-manager root.
const CRON_MANAGER_ROOT = path.resolve(__dirname, "../..");
const PORT = Number(process.env.DASHBOARD_PORT) || 4500;
// Bind to loopback by default so the dashboard is only reachable via the local
// reverse proxy (nginx), never directly from the public internet. Override with
// DASHBOARD_HOST=0.0.0.0 only if you intentionally want it exposed.
const HOST = process.env.DASHBOARD_HOST || "127.0.0.1";

initDb();

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/**
 * Remove a feed entry (one JS object block) from a feeds JS file.
 * Finds the object whose `url:` property matches feedUrl, then removes
 * the entire block from the opening `{` to the closing `},`.
 */
function removeFeedEntry(filePath, feedUrl) {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");
  const escaped = feedUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const urlLine = lines.findIndex((l) =>
    new RegExp(`url:\\s*["']${escaped}["']`).test(l),
  );
  if (urlLine === -1) throw new Error("URL not found in feeds file");

  // Walk up from the url: line to the opening {
  let start = urlLine;
  while (start > 0 && !lines[start].trim().startsWith("{")) start--;

  // Walk down to the closing },
  let end = urlLine;
  while (end < lines.length - 1 && !lines[end].trim().startsWith("},")) end++;

  const newLines = [...lines.slice(0, start), ...lines.slice(end + 1)];
  fs.writeFileSync(filePath, newLines.join("\n"), "utf8");
}

// Recursively find all *.json files under tasks/<task>/inputs/ without external deps.
function scanInputsFiles() {
  const tasksDir = path.join(CRON_MANAGER_ROOT, "tasks");
  const results = [];
  if (!fs.existsSync(tasksDir)) return results;
  for (const task of fs.readdirSync(tasksDir)) {
    const inputsDir = path.join(tasksDir, task, "inputs");
    if (!fs.existsSync(inputsDir) || !fs.statSync(inputsDir).isDirectory()) continue;
    for (const file of fs.readdirSync(inputsDir)) {
      if (file.endsWith(".json")) {
        results.push(`tasks/${task}/inputs/${file}`);
      }
    }
  }
  return results;
}

const STEPS = ["fetch", "pick", "write", "publish", "index"];

/**
 * Strip an HTML page down to readable article text. Removes non-content
 * elements, prefers <article>/<main>, then joins block-level text so the
 * paragraphs survive. Falls back to the whole body text if no blocks match.
 */
function extractArticleText(html) {
  const $ = cheerio.load(html);
  $("script, style, noscript, nav, header, footer, aside, form, iframe, svg, button, figure").remove();
  const article = $("article").first();
  const main = $("main").first();
  const root = article.length ? article : main.length ? main : $("body");
  const parts = [];
  root.find("h1, h2, h3, h4, p, li, blockquote").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t) parts.push(t);
  });
  const text = parts.join("\n\n");
  return text || root.text().replace(/\s+/g, " ").trim();
}

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

const server = http.createServer(async (req, res) => {
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
      const pageSize = 20;
      const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
      const search = (url.searchParams.get("search") || "").trim();
      const favoritesOnly = url.searchParams.get("favorites") === "1";
      const { items, total } = getItemsByGroup(group, {
        limit: pageSize,
        offset: (page - 1) * pageSize,
        search,
        favoritesOnly,
      });
      return sendJson(res, { items, total, page, pageSize });
    }
    // Newest N items (optionally scoped to one group) with the fields needed to
    // build an export for an external AI: title, url, source group, comment.
    if (route === "/api/recent-items") {
      const group = url.searchParams.get("group") || null;
      const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit")) || 50));
      const withCommentsOnly = url.searchParams.get("comments") === "1";
      return sendJson(res, getRecentItems(group, limit, { withCommentsOnly }));
    }
    if (route === "/api/item/favorite" && req.method === "POST") {
      const body = JSON.parse(await readBody(req));
      const { item_id, group, favorite } = body;
      if (!item_id || !group) return sendError(res, 400, "item_id and group required");
      const ok = setItemFavorite(item_id, group, !!favorite);
      return sendJson(res, { ok });
    }
    // Fetch the article behind an item link and return its plain text, so the
    // UI can build a copy-to-clipboard prompt for an external AI chat. Nothing
    // is persisted — this is a one-shot extraction.
    if (route === "/api/item/extract") {
      const target = url.searchParams.get("url");
      if (!target) return sendError(res, 400, "url query param required");
      let parsed;
      try {
        parsed = new URL(target);
      } catch {
        return sendError(res, 400, "invalid url");
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
        return sendError(res, 400, "only http(s) urls allowed");
      const r = await fetch(target, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; pipeline-dashboard/1.0)" },
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) return sendError(res, 502, `fetch failed: HTTP ${r.status}`);
      const html = await r.text();
      const text = extractArticleText(html);
      if (!text) return sendError(res, 422, "no readable text extracted");
      return sendJson(res, { text, url: target });
    }
    if (route === "/api/item/comment" && req.method === "POST") {
      const body = JSON.parse(await readBody(req));
      const { item_id, group, comment } = body;
      if (!item_id || !group) return sendError(res, 400, "item_id and group required");
      const ok = setItemComment(item_id, group, typeof comment === "string" ? comment : "");
      return sendJson(res, { ok });
    }
    if (route === "/api/item/delete" && req.method === "POST") {
      const body = JSON.parse(await readBody(req));
      const { item_id, group } = body;
      if (!item_id || !group) return sendError(res, 400, "item_id and group required");
      const counts = deleteItem(item_id, group);
      console.log(`[dashboard] deleted item ${item_id} (${group}):`, JSON.stringify(counts));
      return sendJson(res, { ok: true, counts });
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
    if (route === "/api/error") {
      const id = Number(url.searchParams.get("id"));
      if (!id) return sendError(res, 400, "id query param required");
      const event = getStepEventById(id);
      if (!event) return sendError(res, 404, "not found");
      return sendJson(res, event);
    }
    if (route === "/api/runs") {
      return sendJson(res, getRecentRuns(100));
    }
    if (route === "/api/flows") {
      return sendJson(res, FLOWS);
    }
    // Per-run flow detail: the canonical flow definition for the task + every
    // event recorded during this execution, so the UI can draw the diagram and
    // the detailed checkpoint list for one clicked run.
    if (route === "/api/run") {
      const executionId = url.searchParams.get("execution_id");
      if (!executionId) return sendError(res, 400, "execution_id query param required");
      const run = getRunByExecutionId(executionId);
      if (!run) return sendError(res, 404, "run not found");
      const events = getEventsByExecution(executionId);
      const flow = getFlow(run.task);
      return sendJson(res, { run, flow, events });
    }

    if (route === "/api/bad-feeds") {
      return sendJson(res, getBadFeeds());
    }
    if (route === "/api/feed/delete" && req.method === "POST") {
      const body = JSON.parse(await readBody(req));
      const { url, feeds_js_path } = body;
      if (!url || !feeds_js_path) return sendError(res, 400, "url and feeds_js_path required");
      // Security: only allow edits inside tasks/
      if (!feeds_js_path.startsWith("tasks/") || feeds_js_path.includes(".."))
        return sendError(res, 400, "invalid feeds_js_path");
      const fullPath = path.resolve(CRON_MANAGER_ROOT, feeds_js_path);
      if (!fullPath.startsWith(path.resolve(CRON_MANAGER_ROOT, "tasks")))
        return sendError(res, 400, "path outside tasks directory");
      removeFeedEntry(fullPath, url);
      console.log(`[dashboard] removed feed "${url}" from ${feeds_js_path}`);
      return sendJson(res, { ok: true });
    }

    if (route === "/api/ai-costs") {
      const period = url.searchParams.get("period") || "month";
      const group = url.searchParams.get("group") || null;
      return sendJson(res, getAiCostsByGroup(period, group));
    }
    if (route === "/api/ai-costs/timeline") {
      const granularity = url.searchParams.get("granularity") || "day";
      const period = url.searchParams.get("period") || "month";
      const group = url.searchParams.get("group") || null;
      return sendJson(res, getAiCostsTimeline(granularity, period, group));
    }

    if (route === "/api/inputs") {
      if (req.method === "POST") {
        const body = JSON.parse(await readBody(req));
        const { file, content } = body;
        if (!file || content === undefined) return sendError(res, 400, "file and content required");
        if (!file.startsWith("tasks/") || file.includes(".."))
          return sendError(res, 400, "invalid file path");
        const fullPath = path.resolve(CRON_MANAGER_ROOT, file);
        if (!fullPath.startsWith(path.resolve(CRON_MANAGER_ROOT, "tasks")))
          return sendError(res, 400, "path outside tasks directory");
        // Validate that content is valid JSON before writing
        JSON.parse(content);
        fs.writeFileSync(fullPath, content, "utf8");
        console.log(`[dashboard] inputs file updated: ${file}`);
        return sendJson(res, { ok: true });
      }
      // GET: list or read one file
      const file = url.searchParams.get("file");
      if (file) {
        if (!file.startsWith("tasks/") || file.includes(".."))
          return sendError(res, 400, "invalid file path");
        const fullPath = path.resolve(CRON_MANAGER_ROOT, file);
        if (!fullPath.startsWith(path.resolve(CRON_MANAGER_ROOT, "tasks")))
          return sendError(res, 400, "path outside tasks directory");
        const content = JSON.parse(fs.readFileSync(fullPath, "utf8"));
        return sendJson(res, { file, content });
      }
      return sendJson(res, scanInputsFiles());
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
