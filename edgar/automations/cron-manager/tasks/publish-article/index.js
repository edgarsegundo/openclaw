import dotenv from "dotenv";
dotenv.config();

import fs from "fs/promises";
import path from "path";
import { submitToIndexingApi } from "./google-indexing.js";

/**
 * publish-article task
 *
 * Operates in two parts:
 *
 *   Part 1 (automatic, cron):
 *     Picks the oldest unpublished article, POSTs it to the blog API,
 *     moves files to published/, registers the article in today's status file,
 *     then sends a Discord list of ALL today's articles with their status.
 *     Discord is only notified when Part 1 actually succeeds — silent otherwise.
 *
 *   Part 2 (manual, Discord command .pub N):
 *     Detects action=pub + item_index=N, looks up the article at index N
 *     in today's status file, runs execute-publish-script + Google Indexing API,
 *     updates status to "published", and notifies Discord with the result.
 *
 * Status file (per groupDir, per day):
 *   {groupDir}/status-<YYYY-MM-DD>.json
 *   Tracks every article that passed through Part 1 today, with sequential
 *   0-based indices that are permanent for the day.
 *
 * Inputs:
 *   groupDir  — path to folder containing generated article *.json/*.md files (required)
 *   destinations  — array of { business_id, blog_topic_slug, sitemap_url, site_id } (required)
 *   action        — "pub" (manual Discord command, triggers Part 2)
 *   item_index    — 0-based index from today's status file (for .pub N command)
 *
 * Env vars:
 *   MYSITESAPP_API_KEY / x-api-key         — API key for the blog endpoint
 *   GOOGLE_APPLICATION_CREDENTIALS         — path to Google Service Account JSON
 *
 * State files:
 *   {groupDir}/publish-article.roundrobin.json — round-robin index (Part 1 only)
 *   {groupDir}/status-<YYYY-MM-DD>.json        — daily article status registry
 *
 * Endpoint:
 *   POST http://localhost:3900/blog-article
 *   POST http://localhost:3900/execute-publish-script
 */
export default async function (context) {
  const { taskName, mode, executionId, inputs } = context;
  const apiKey = process.env.MYSITESAPP_API_KEY || process.env["x-api-key"] || "";
  const discordWebhookUrl = inputs.discord_webhook_url ?? null;

  const group = (inputs.group || "").trim();
  if (!group) {
    console.error(
      "❌ Parâmetro 'group' obrigatório. Defina no arquivo dentro do diretório 'inputs'",
    );
    return;
  }

  console.log(`Task: ${taskName} | Mode: ${mode} | ID: ${executionId}`);

  // ── Validate core inputs ─────────────────────────────────────────────────
  const { articles_dir: articlesDir, destinations } = inputs;
  const action = inputs.action ?? null;
  const itemIndex = inputs.item_index ?? null;

  if (!articlesDir) throw new Error("Missing required input: articles_dir");

  const groupDir = path.join(articlesDir, group); // always "./artifacts/write-article/group"

  if (!Array.isArray(destinations) || destinations.length === 0) {
    throw new Error("Missing required input: destinations (must be a non-empty array)");
  }

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const publishedDir = path.join(articlesDir, "published");
  await fs.mkdir(publishedDir, { recursive: true });

  // ── Command: list ─────────────────────────────────────────────
  if (action === "l2") {
    console.log(`\n/list command received`);

    const statusData = await loadStatus(articlesDir, today);

    if (!statusData.articles.length) {
      const { notifyDiscord } = await import("../../lib/discord.js");
      await notifyDiscord("📭 Nenhum artigo encontrado hoje.", discordWebhookUrl);
      return;
    }

    console.log(`** Loaded statusData: ${JSON.stringify(statusData)}`);

    await sendFullListToDiscord(statusData, articlesDir, discordWebhookUrl, group, apiKey);

    console.log("✅ List sent to Discord!");
    return;
  }

  // ── Part 2: manual indexing command (.pub N) ─────────────────────────────
  if (action === "pub" && itemIndex !== null) {
    console.log(`\n.pub command received. item_index=${itemIndex}`);

    const statusData = await loadStatus(articlesDir, today);
    const idx = Number(itemIndex);
    const entry = statusData.articles.find((a) => a.index === idx);

    if (!entry) {
      console.log(`No article found with index ${idx} in today's status. Exiting.`);
      return;
    }

    console.log(`\nRunning Part 2 for: ${entry.slug}`);

    // Read the article JSON from published/ to get site_id and sitemap_url
    const json = await readJson(path.join(publishedDir, `${entry.slug}.json`));
    if (!json) {
      console.error(`Could not read article JSON for slug: ${entry.slug}. Exiting.`);
      return;
    }

    const articleSlugField = json.slug ?? entry.slug;
    const domain = json.sitemap_url ? new URL(json.sitemap_url).origin : null;
    const articleUrl = domain ? `${domain}/blog/${articleSlugField}` : null;

    console.log(`Article URL: ${articleUrl}`);

    // Execute publish script
    const publishPayload = { site_id: json.site_id };
    console.log(`Posting site_id="${json.site_id}" to execute-publish-script`);
    const publishSuccess = await postPublish(publishPayload, apiKey);

    if (!publishSuccess) {
      console.error("POST to execute-publish-script failed.");
      const { notifyDiscord } = await import("../../lib/discord.js");
      await notifyDiscord(
        `❌ Falha ao executar o script de publicação para: ${entry.slug}`,
        discordWebhookUrl,
      );
      return;
    }

    console.log("Publish script executed successfully!");

    // Submit to Google Indexing API
    let apiResult = articleUrl
      ? await submitToIndexingApi(articleUrl)
      : { ok: false, error: "articleUrl could not be derived (missing sitemap_url in JSON)" };

    if (!apiResult) {
      apiResult = { ok: false, error: "submitToIndexingApi returned undefined" };
    }

    // Update status to published
    const updatedStatus = markAsPublished(statusData, idx);
    await saveStatus(articlesDir, today, updatedStatus);

    // Notify Discord
    await notifyIndexingResult(
      entry.slug,
      apiResult,
      json.site_id,
      discordWebhookUrl,
      domain,
      articleUrl,
    );

    console.log("\n✅ Part 2 done!");
    return;
  }

  // ── Part 1: original publish flow ────────────────────────────────────────

  // ── 1. Find oldest unpublished JSON article ───────────────────────────────
  const allFiles = await fs.readdir(articlesDir);
  const jsonFiles = allFiles.filter(
    (f) =>
      f.endsWith(".json") && f !== "publish-article.roundrobin.json" && !f.startsWith("status-"),
  );

  if (jsonFiles.length === 0) {
    // No new articles — exit silently, no Discord notification
    console.log("No .json articles found. Nothing to publish. Exiting silently.");
    return;
  }

  const oldest = await findOldest(articlesDir, jsonFiles);
  const slug = oldest.replace(/\.json$/, "");

  console.log(`\nSelected article: ${slug}`);

  // ── 2. Load JSON and Markdown ─────────────────────────────────────────────
  const jsonPath = path.join(articlesDir, `${slug}.json`);
  const mdPath = path.join(articlesDir, `${slug}.md`);

  const json = await readJson(jsonPath);
  if (!json) {
    console.error(`Failed to parse JSON: ${jsonPath}. Skipping.`);
    return;
  }

  const contentMd = (await readFileSafe(mdPath)) ?? json.markdownText ?? "";

  // ── 3. Validate required fields ───────────────────────────────────────────
  const missingFields = ["title", "seoMetaDescription", "slug"].filter((f) => !json[f]);
  if (missingFields.length > 0) {
    console.error(`Missing required fields in JSON: ${missingFields.join(", ")}. Skipping.`);
    return;
  }

  // ── 4. Resolve destination via round-robin ────────────────────────────────
  const roundRobinPath = path.join(articlesDir, "publish-article.roundrobin.json");
  const lastIdx = await readLastIdx(roundRobinPath);
  const nextIdx = (lastIdx + 1) % destinations.length;
  const destination = destinations[nextIdx];

  const sanitizedBusinessId =
    typeof destination.business_id === "string"
      ? destination.business_id.replace(/-/g, "")
      : destination.business_id;

  await fs.writeFile(roundRobinPath, JSON.stringify({ lastIdx: nextIdx }, null, 2));

  // ── 5. Build and POST article payload ─────────────────────────────────────
  const payload = {
    // id: randomUUID(),
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

  const apiResult = await postArticle(payload, apiKey);
  if (!apiResult || apiResult.error) {
    // Part 1 failed — no Discord notification
    console.error("POST failed. Article will not be moved to published/.");
    console.error(`Error status: ${apiResult ? apiResult.status : "N/A"}`);
    return;
  }

  // grava sem traços os blog_article_id para passar como query param pro editor de imagens do MsitesApp, que tem problema com traços no ID
  const blog_article_id = (apiResult.article.id ?? "").replace(/-/g, "") || null;

  console.log(`** Article posted successfully with ID: ${blog_article_id}`);

  // return { error: true, status: res.status, article: null };

  console.log("Saved successfully!");

  // ── 6. Enrich JSON with destination metadata and move to published/ ───────
  const sitemapUrl = destination.sitemap_url ?? null;
  const siteId = destination.site_id ?? null;

  if (sitemapUrl) json.sitemap_url = sitemapUrl;
  if (siteId) json.site_id = siteId;

  // Write enriched JSON back before moving
  await fs.writeFile(jsonPath, JSON.stringify(json, null, 2), "utf-8");

  const publishedJsonPath = path.join(publishedDir, `${slug}-${today}.json`);
  const publishedMdPath = path.join(publishedDir, `${slug}-${today}.md`);

  await fs.rename(jsonPath, publishedJsonPath);

  if (await fileExists(mdPath)) {
    await fs.rename(mdPath, publishedMdPath);
  }

  console.log(`Moved to published/${slug}-${today}.[json|md]`);

  // ── 7. Register article in today's status file ────────────────────────────
  const statusData = await loadStatus(articlesDir, today);
  const newSlug = `${slug}-${today}`;
  const newIndex = statusData.articles.length; // next sequential index
  const newEntry = {
    index: newIndex,
    slug: newSlug,
    status: "saved",
    saved_at: new Date().toISOString(),
    published_at: null,
    blog_article_id: blog_article_id,
  };

  statusData.articles.push(newEntry);
  await saveStatus(articlesDir, today, statusData);
  console.log(`Registered in status as index ${newIndex}: ${newSlug}`);

  // ── 8. Send Discord notification ──────────────────────────────────────────
  // Only reached when Part 1 succeeds. Shows ALL today's articles with status.
  // The article just saved is highlighted as 🆕.
  await sendPublishedList(
    statusData,
    articlesDir,
    newIndex,
    discordWebhookUrl,
    group,
    blog_article_id,
  );

  // ── 9. Clean up old files ─────────────────────────────────────────────────
  await cleanOldFiles(publishedDir, 7);
  // Also clean up old status files in groupDir
  await cleanOldStatusFiles(groupDir, 7);

  console.log("\n✅ Done!");
}

// ── Status file helpers ───────────────────────────────────────────────────────

/**
 * Load today's status file. Returns a fresh structure if it doesn't exist yet.
 */
async function loadStatus(articlesDir, today) {
  const statusPath = path.join(articlesDir, `status-${today}.json`);
  try {
    const raw = await fs.readFile(statusPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { date: today, articles: [] };
  }
}

/**
 * Persist the status object to disk.
 */
async function saveStatus(articlesDir, today, statusData) {
  const statusPath = path.join(articlesDir, `status-${today}.json`);
  await fs.writeFile(statusPath, JSON.stringify(statusData, null, 2), "utf-8");
}

/**
 * Return a new statusData with the article at `index` marked as published.
 */
function markAsPublished(statusData, index) {
  return {
    ...statusData,
    articles: statusData.articles.map((a) =>
      a.index === index ? { ...a, status: "published", published_at: new Date().toISOString() } : a,
    ),
  };
}

// ── Discord notification helpers ──────────────────────────────────────────────

const DISCORD_MSG_MAX_LENGTH = 1800;

/**
 * Send today's full article list to Discord.
 * Sorted newest-first (descending index) so the new article appears at the top.
 * The article with index === newIndex is highlighted with 🆕.
 */
async function sendPublishedList(
  statusData,
  articlesDir,
  newIndex,
  discordWebhookUrl,
  group,
  blog_article_id,
) {
  const { notifyDiscord } = await import("../../lib/discord.js");

  const topicLabel = path.basename(articlesDir);
  const sorted = [...statusData.articles].sort((a, b) => b.index - a.index);

  const header = `📰 Artigos do dia — "${topicLabel}":\n> .pub <N> para publicar e indexar no Google\n`;
  const continuation = `🔁 Continuando...\n`;

  let currentMsg = header;
  let sentMessages = 0;

  for (const article of sorted) {
    const isNew = article.index === newIndex;
    const statusLabel = article.status === "published" ? "(published ✅)" : "(saved)";
    const prefix = isNew ? "🆕" : "   ";
    const safeLink = `https://fastvistos.com.br/msitesapp/api/admin/image-uploader?token=${apiKey}&blog_article_id=${blog_article_id}&group=${group}`;
    const line = `\n${prefix} [${article.index}] ${article.slug} ${statusLabel} - [Editar](<${safeLink}>)`;

    if ((currentMsg + line).length > DISCORD_MSG_MAX_LENGTH) {
      await notifyDiscord(currentMsg, discordWebhookUrl);
      sentMessages++;
      currentMsg = continuation + line;
    } else {
      currentMsg += line;
    }
  }

  if (currentMsg.trim()) {
    await notifyDiscord(currentMsg, discordWebhookUrl);
    sentMessages++;
  }

  console.log(
    `Discord notified with ${statusData.articles.length} article(s) in ${sentMessages} message(s).`,
  );
}

/**
 * Notify Discord with the result of the Part 2 indexing action.
 */
async function notifyIndexingResult(
  slug,
  apiResult,
  siteId,
  discordWebhookUrl,
  domain,
  articleUrl,
) {
  const { notifyDiscord } = await import("../../lib/discord.js");

  const apiIcon = apiResult.ok ? "✅" : "❌";
  let msg = apiResult.ok
    ? `✅ Indexação e publicação concluída para '${slug}' com site-id da '${siteId}'`
    : `⚠️ Indexação com erros para: '${slug}' com site-id da '${siteId}'`;

  const searchConsoleLink = `https://search.google.com/search-console?resource_id=sc-domain%3A${domain}&hl=pt-br`;
  msg += `\n  - [gsc](<${searchConsoleLink}>)`;
  msg += `\n  - [artigo](<${articleUrl}>)`;

  if (!apiResult.ok && apiResult.error) {
    msg += `\n   Erro: ${apiResult.error}`;
  }

  await notifyDiscord(msg, discordWebhookUrl);
}

// ── File helpers ──────────────────────────────────────────────────────────────

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
 * Reads a file safely. Returns null if the file does not exist or cannot be read.
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
      return { error: true, status: res.status, article: null };
    }

    const data = await res.json();
    return { status: res.status, article: data.article };
  } catch (err) {
    console.error(`POST error: ${err.message}`);
    return { error: true, status: res.status, article: null };
  }
}

/**
 * Executes the publish script on the VPS.
 * Returns true on success, false on failure.
 * Node.js 18+ (Node 22): usa fetch global e AbortController nativo.
 */
async function postPublish(payload, apiKey) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 300_000); // 5 minutos

    const res = await fetch("http://localhost:3900/execute-publish-script", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const body = await res.text();
      console.error(`POST failed: ${res.status} ${body}`);
      return false;
    }

    return true;
  } catch (err) {
    if (err.name === "AbortError") {
      console.error("POST error: Timeout (request aborted)");
    } else {
      console.error(`POST error: ${err.message}`);
    }
    return false;
  }
}

/**
 * Deletes files in the given directory older than `days` days (by mtime).
 */
async function cleanOldFiles(dir, days) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  let files;
  try {
    files = await fs.readdir(dir);
  } catch {
    return;
  }

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

/**
 * Deletes status-<YYYY-MM-DD>.json files in groupDir older than `days` days.
 */
async function cleanOldStatusFiles(articlesDir, days) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  let files;
  try {
    files = await fs.readdir(articlesDir);
  } catch {
    return;
  }

  for (const file of files) {
    const match = file.match(/^status-(\d{4}-\d{2}-\d{2})\.json$/);
    if (!match) continue;
    const fileDate = new Date(match[1]);
    if (fileDate.getTime() < cutoff) {
      try {
        await fs.unlink(path.join(articlesDir, file));
        console.log(`Cleaned up status file: ${file}`);
      } catch {
        // skip
      }
    }
  }
}

async function sendFullListToDiscord(statusData, articlesDir, discordWebhookUrl, group, apiKey) {
  const { notifyDiscord } = await import("../../lib/discord.js");

  const topicLabel = path.basename(articlesDir);

  // Ordena do mais recente para o mais antigo
  const sorted = [...statusData.articles].sort((a, b) => b.index - a.index);

  const header = `📋 Lista de artigos — "${topicLabel}":\n> .pub <N> para publicar\n`;
  const continuation = `🔁 Continuação da lista:\n`;

  let currentMsg = header;
  let sentMessages = 0;

  for (const article of sorted) {
    const statusIcon = article.status === "published" ? "✅" : "💾";

    let safeLink = "";
    if (article.status !== "published") {
      safeLink = `https://fastvistos.com.br/msitesapp/api/admin/image-uploader?token=${apiKey}&blog_article_id=${article.blog_article_id}&group=${group}`;
      currentMsg += `\n[${article.index}] ${article.slug} ${statusIcon} - [Editar](<${safeLink}>)`;
      continue;
    }
    const editLink = article.status === "published" ? ` - [Editar](<${safeLink}>)` : "";
    const line = `\n[${article.index}] ${article.slug} ${statusIcon}${editLink}`;

    // Se estourar limite do Discord
    if ((currentMsg + line).length > DISCORD_MSG_MAX_LENGTH) {
      await notifyDiscord(currentMsg, discordWebhookUrl);
      sentMessages++;
      currentMsg = continuation + line;
    } else {
      currentMsg += line;
    }
  }

  if (currentMsg.trim()) {
    await notifyDiscord(currentMsg, discordWebhookUrl);
    sentMessages++;
  }

  console.log(
    `Discord list sent with ${statusData.articles.length} article(s) in ${sentMessages} message(s).`,
  );
}
