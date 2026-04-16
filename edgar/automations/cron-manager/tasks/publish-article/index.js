import dotenv from 'dotenv';
dotenv.config();

import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { submitToIndexingApi } from "./google-indexing.js";

/**
 * publish-article task
 *
 * Operates in two parts:
 *
 *   Part 1 (automatic, cron) — unchanged original flow:
 *     Picks the oldest unpublished article, POSTs it to the blog API,
 *     moves files to published/, then sends a Discord list of today's
 *     published articles so the user can trigger Part 2.
 *
 *   Part 2 (manual, Discord command /pub N):
 *     Detects action=pub + item_index=N, finds the article at index N
 *     in today's published/ files, runs sitemap ping + Google Indexing API,
 *     and notifies Discord with the result.
 *
 * Inputs:
 *   articles_dir  — path to folder containing generated article *.json/*.md files (required)
 *   destinations  — array of { business_id, blog_topic_slug } objects (required)
 *   sitemap_url   — full sitemap URL for Google ping (required for Part 2)
 *   action        — "pub" (manual Discord command, triggers Part 2)
 *   item_index    — 0-based index of the article in today's published/ list
 *
 * Env vars:
 *   MYSITESAPP_API_KEY / x-api-key         — API key for the blog endpoint
 *   GOOGLE_APPLICATION_CREDENTIALS         — path to Google Service Account JSON
 *
 * State file:
 *   {articles_dir}/publish-article.roundrobin.json — persists round-robin index (Part 1 only)
 *
 * Endpoint:
 *   POST http://localhost:3900/blog-article
 */
export default async function (context) {
  const { taskName, mode, executionId, inputs, env } = context;
  const apiKey = process.env.MYSITESAPP_API_KEY || process.env["x-api-key"] || "";

  console.log(`Task: ${taskName} | Mode: ${mode} | ID: ${executionId}`);

  // ── Validate core inputs ─────────────────────────────────────────────────
  const { articles_dir: articlesDir, destinations } = inputs;
  const action = inputs.action ?? null;
  const itemIndex = inputs.item_index ?? null;

  if (!articlesDir) throw new Error("Missing required input: articles_dir");
  if (!Array.isArray(destinations) || destinations.length === 0) {
    throw new Error("Missing required input: destinations (must be a non-empty array)");
  }

  const publishedDir = path.join(articlesDir, "published");
  await fs.mkdir(publishedDir, { recursive: true });

  // ── Part 2: manual indexing command ─────────────────────────────────────
  // Runs when user sends /pub N via Discord.
  // Does NOT execute Part 1.
  if (action === "pub" && itemIndex !== null) {
    console.log(`\n/pub command received. item_index=${itemIndex}`);

    const todayFiles = await getTodayPublishedFiles(publishedDir);

    if (todayFiles.length === 0) {
      console.log("No published articles found for today. Exiting.");
      return;
    }

    const idx = Number(itemIndex);

    if (idx < 0 || idx >= todayFiles.length) {
      console.log(
        `item_index (${idx}) out of range. ` +
        `Today has ${todayFiles.length} published article(s) (valid range: 0–${todayFiles.length - 1}).`
      );
      return;
    }

    const targetFile = todayFiles[idx];
    const slug = articleSlug(targetFile.name);

    console.log(`\nRunning Part 2 for: ${slug}`);

    // Read the article JSON to get the canonical URL slug
    const json = await readJson(path.join(publishedDir, targetFile.name));
    const articleSlugField = json?.slug ?? slug;

    // Build the full article URL — derive domain from sitemap URL
    const domain = new URL(json.sitemap_url).origin;
    const articleUrl = `${domain}/${articleSlugField}`;

    console.log(`Article URL: ${articleUrl}`);

    const payload = { site_id: json.site_id };
    console.log(`\nPosting: "${payload.site_id}" to execute-publish-script`);
    const success = await postPublish(payload, apiKey);
    if (!success) {
      console.error("POST failed. Article cannot be indexed.");
      return;
    }
    console.log("Publish script executed successfully!");

    // Run indexing action
    let apiResult = await submitToIndexingApi(articleUrl);
    if (!apiResult) apiResult = { ok: false, error: "submitToIndexingApi returned undefined" };

    // Notify Discord with result (apenas Indexing API)
    await notifyIndexingResult(slug, apiResult);

    console.log("\n✅ Part 2 done!");
    return;
  }

  // ── Part 1: original publish flow ────────────────────────────────────────
  // Unchanged from original. Runs automatically via cron.

  // ── 1. Find oldest unpublished JSON article ───────────────────────────────
  const allFiles = await fs.readdir(articlesDir);
  const jsonFiles = allFiles.filter(
    (f) => f.endsWith(".json") && f !== "publish-article.roundrobin.json"
  );

  if (jsonFiles.length === 0) {
    console.log("No .json articles found. Nothing to publish.");
  } else {
    const oldest = await findOldest(articlesDir, jsonFiles);
    const slug = oldest.replace(/\.json$/, "");

    console.log(`\nSelected article: ${slug}`);

    // ── 2. Load JSON and Markdown ─────────────────────────────────────────
    const jsonPath = path.join(articlesDir, `${slug}.json`);
    const mdPath = path.join(articlesDir, `${slug}.md`);

    const json = await readJson(jsonPath);
    if (!json) {
      console.error(`Failed to parse JSON: ${jsonPath}. Skipping.`);
      return;
    }

    const contentMd = (await readFileSafe(mdPath)) ?? json.markdownText ?? "";

    // ── 3. Validate required fields ───────────────────────────────────────
    const missingFields = ["title", "seoMetaDescription", "slug"].filter((f) => !json[f]);
    if (missingFields.length > 0) {
      console.error(`Missing required fields in JSON: ${missingFields.join(", ")}. Skipping.`);
      return;
    }

    // ── 4. Resolve destination via round-robin ────────────────────────────
    const statePath = path.join(articlesDir, "publish-article.roundrobin.json");
    const lastIdx = await readLastIdx(statePath);
    const nextIdx = (lastIdx + 1) % destinations.length;
    const destination = destinations[nextIdx];

    const sanitizedBusinessId = typeof destination.business_id === "string"
      ? destination.business_id.replace(/-/g, "")
      : destination.business_id;

    console.log(
      `Destination: business_id=${sanitizedBusinessId} | blog_topic_slug=${destination.blog_topic_slug}`
    );

    await fs.writeFile(statePath, JSON.stringify({ lastIdx: nextIdx }, null, 2));

    // ── 5. Build and send payload ─────────────────────────────────────────
    const payload = {
      id: randomUUID(),
      business_id: sanitizedBusinessId,
      blog_topic_slug: destination.blog_topic_slug,
      title: json.title,
      seo_description: json.seoMetaDescription,
      content_md: contentMd,
      faq_json: json.faq_json ?? [],
      type: "public",
      slug: json.slug ?? slug,
      published: json.published ?? new Date().toISOString(),
    };
    console.log(`\nPosting: "${payload.title}"`);
    console.log(`Using API key: ${apiKey ? "****" + apiKey.slice(-4) : "(none)"}`);
    const success = await postArticle(payload, apiKey);
    if (!success) {
      console.error("POST failed. Article will not be moved to published/.");
      return;
    }

    console.log("Saved successfully!");

    // ── 6. Move files to published/ ───────────────────────────────────────
    const today = new Date().toISOString().slice(0, 10);
    await fs.rename(jsonPath, path.join(publishedDir, `${slug}-${today}.json`));

    if (await fileExists(mdPath)) {
      // Adiciona o sitemap_url ao JSON e salva antes de mover
      const sitemapUrl = destinations[nextIdx]?.sitemap_url ?? null;
      if (sitemapUrl) {
        json.sitemap_url = sitemapUrl;
        json.site_id = destinations[nextIdx]?.site_id ?? null;
        try {
          await fs.writeFile(jsonPath, JSON.stringify(json, null, 2), "utf-8");
        } catch (err) {
          console.error(`Erro ao salvar sitemap_url no JSON do artigo (${jsonPath}):`, err);
        }
      }

      await fs.rename(mdPath, path.join(publishedDir, `${slug}-${today}.md`));
    }

    console.log(`Moved to published/${slug}-${today}.[json|md]`);

    // ── 7. Clean up published files older than 7 days ─────────────────────
    await cleanOldFiles(publishedDir, 7);
  }

  // ── 8. Send Discord list of today's published articles ───────────────────
  // Always runs after Part 1, whether or not an article was published today.
  const todayFiles = await getTodayPublishedFiles(publishedDir);

  if (todayFiles.length === 0) {
    console.log("No published articles for today. Skipping Discord notification.");
  } else {
    await sendPublishedList(todayFiles, articlesDir);
  }

  console.log("\n✅ Done!");
}

// ── Discord notification helpers ──────────────────────────────────────────────

const DISCORD_MSG_MAX_LENGTH = 1999;
const NEW_FILE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Send the list of today's published articles to Discord.
 * Files moved in the last 10 minutes are marked as 🆕.
 * Splits into multiple messages if needed.
 */
async function sendPublishedList(todayFiles, articlesDir) {
  const { notifyDiscord } = await import("../../lib/discord.js");

  const topicLabel = path.basename(articlesDir);
  const now = Date.now();

  const header = `📰 Artigos gravados hoje — "${topicLabel}":\n> /pub <N> para publicar e indexar no Google\n`;
  const continuation = `🔁 Continuando...\n`;

  let currentMsg = header;
  let sentMessages = 0;

  for (let i = 0; i < todayFiles.length; i++) {
    const file = todayFiles[i];
    const isNew = (now - file.mtimeMs) < NEW_FILE_WINDOW_MS;
    const prefix = isNew ? "🆕" : "   ";
    const line = `\n${prefix} [${i}] ${articleSlug(file.name)}`;

    if ((currentMsg + line).length > DISCORD_MSG_MAX_LENGTH) {
      notifyDiscord(currentMsg);
      sentMessages++;
      currentMsg = continuation + line;
    } else {
      currentMsg += line;
    }
  }

  if (currentMsg.trim()) {
    notifyDiscord(currentMsg);
    sentMessages++;
  }

  console.log(
    `Discord notified with ${todayFiles.length} article(s) in ${sentMessages} message(s).`
  );
}

/**
 * Notify Discord with the result of the Part 2 indexing actions (apenas Indexing API).
 */
async function notifyIndexingResult(slug, apiResult) {
  const { notifyDiscord } = await import("../../lib/discord.js");

  const apiIcon = apiResult.ok ? "✅" : "❌";
  let msg = apiResult.ok
    ? `✅ Indexação concluída para: ${slug}`
    : `⚠️ Indexação com erros para: ${slug}`;

  msg += `\n   Indexing API: ${apiIcon}`;
  if (!apiResult.ok && apiResult.error) {
    msg += `\n   Erro Indexing API: ${apiResult.error}`;
  }

  notifyDiscord(msg);
}

// ── File helpers ──────────────────────────────────────────────────────────────

/**
 * Returns today's .json files from published/, sorted by mtime ASC.
 * Each entry: { name, mtimeMs }
 */
async function getTodayPublishedFiles(publishedDir) {
  const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  let files;

  try {
    files = await fs.readdir(publishedDir);
  } catch {
    return [];
  }

  const jsonFiles = files.filter((f) => f.endsWith(".json"));
  const results = [];

  for (const name of jsonFiles) {
    try {
      const stat = await fs.stat(path.join(publishedDir, name));
      // Filter by file date in the filename (slug-YYYY-MM-DD.json)
      if (name.includes(todayStr)) {
        results.push({ name, mtimeMs: stat.mtimeMs });
      }
    } catch {
      // skip unreadable files
    }
  }

  return results.sort((a, b) => a.mtimeMs - b.mtimeMs);
}

/**
 * Extract a clean slug from a published filename.
 * "my-article-2025-04-15.json" → "my-article-2025-04-15"
 */
function articleSlug(filename) {
  return filename.replace(/\.json$/, "");
}

/**
 * Returns the filename of the oldest file (by mtime) in the given list.
 */
async function findOldest(dir, files) {
  let oldest = null;
  let oldestMtime = Infinity;

  for (const file of files) {
    const stat = await fs.stat(path.join(dir, file));
    if (stat.mtimeMs < oldestMtime) {
      oldest = file;
      oldestMtime = stat.mtimeMs;
    }
  }

  return oldest;
}

/**
 * Reads and parses a JSON file. Returns null on error.
 */
async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Reads a file safely. Returns null if file does not exist or cannot be read.
 */
async function readFileSafe(filePath) {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Returns true if a file exists.
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads the last round-robin index from the state file.
 * Returns -1 if the file does not exist or cannot be parsed.
 */
async function readLastIdx(statePath) {
  try {
    const state = JSON.parse(await fs.readFile(statePath, "utf-8"));
    return typeof state.lastIdx === "number" ? state.lastIdx : -1;
  } catch {
    return -1;
  }
}

/**
 * POSTs the article payload to the blog API.
 * Returns true on success, false on failure.
 */
async function postArticle(payload, apiKey) {
  try {
    const { default: fetch } = await import("node-fetch");
    const res = await fetch("http://localhost:3900/blog-article", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`POST failed: ${res.status} ${body}`);
      return false;
    }

    return true;
  } catch (err) {
    console.error(`POST error: ${err.message}`);
    return false;
  }
}

/**
 * Executes the publish.sh script on the vps
 * Returns true on success, false on failure.
 */
async function postPublish(payload, apiKey) {
  try {
    const { default: fetch } = await import("node-fetch");
    const res = await fetch("http://localhost:3900/execute-publish-script", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`POST failed: ${res.status} ${body}`);
      return false;
    }

    return true;
  } catch (err) {
    console.error(`POST error: ${err.message}`);
    return false;
  }
}

/**
 * Deletes files in the given directory that are older than `days` days.
 */
async function cleanOldFiles(dir, days) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const files = await fs.readdir(dir);
  let removed = 0;

  for (const file of files) {
    const filePath = path.join(dir, file);
    try {
      const stat = await fs.stat(filePath);
      if (stat.mtimeMs < cutoff) {
        await fs.unlink(filePath);
        removed++;
        console.log(`Cleaned up: ${file}`);
      }
    } catch {
      // skip files that cannot be stat'd or deleted
    }
  }

  if (removed === 0) {
    console.log("No old files to clean up.");
  }
}
