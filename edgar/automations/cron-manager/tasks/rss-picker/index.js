import fs from "fs";
import path from "path";
import slugify from "slugify";
import { notifyDiscord } from "../../lib/discord.js";

/**
 * rss-picker task
 *
 * Reads today's raw_news artifact from rss-fetcher, filters items already
 * resolved (approved or deleted — by human or AI), and decides between two paths:
 *
 *   AI path    — unresolved items >= min_items → sends to Perplexity Sonar for triage
 *   Human path — unresolved items < min_items  → notifies Discord only with NEW items
 *                                                 (items not yet sent in a previous run)
 *
 * State is tracked exclusively via a daily status file per topic:
 *   artifacts/rss-picker/status-<topicSlug>-<YYYY-MM-DD>.json
 *
 * Inputs:
 *   rss_fetcher_output_artifact_file_name_pattern  — path pattern with {date} placeholder (required)
 *                    e.g. "artifacts/rss-fetcher/rss-artifact-visto-americano-{date}.json"
 *   blog_context   — description of your blog and audience (optional)
 *   min_items      — minimum unresolved items required to trigger AI triage (default: 3)
 *   min_score      — minimum relevance score 0-10 to publish an item (default: 7)
 *   action         — "apr" or "del" (manual command from Discord)
 *   item_index     — 1-based index of the item in the fetcher array (manual command)
 *
 * Daily files:
 *   artifacts/rss-picker/status-<topicSlug>-<YYYY-MM-DD>.json   — resolved + sent items registry
 *   artifacts/rss-picker/approved-<topicSlug>-<YYYY-MM-DD>.json — approved items for article-writer
 *   Both are deleted automatically after 7 days.
 */
export default async function (context) {
  const { taskName, mode, executionId, inputs, runPrompt } = context;
  const itemIndex = inputs.item_index ?? null;
  const action = inputs.action ?? null;
  const discordWebhookUrl = inputs.discord_webhook_url ?? null;

  console.log(`Task: ${taskName} | Mode: ${mode} | ID: ${executionId}`);

  const minItems = Number(inputs.min_items) || 3;
  const minScore = Number(inputs.min_score) || 7;

  // ── 1. Setup & load fetcher file ─────────────────────────────────────────
  fs.mkdirSync(path.resolve("artifacts/rss-picker"), { recursive: true });

  const today = new Date().toISOString().slice(0, 10);
  const rawNewsPath = path.resolve(
    inputs.rss_fetcher_output_artifact_file_name_pattern.replace("{date}", today)
  );

  console.log(`\nLooking for today's fetcher file: ${rawNewsPath}`);

  if (!fs.existsSync(rawNewsPath)) {
    console.log("File not found. rss-fetcher may not have run yet today. Exiting.");
    return;
  }

  const fetcherArtifact = JSON.parse(fs.readFileSync(rawNewsPath, "utf-8"));
  const allItems = fetcherArtifact.items || [];
  const topic = fetcherArtifact.topic;
  const topicSlug = slugify(topic, { lower: true });

  console.log(`Topic: ${topic}`);
  console.log(`Topic slug: ${topicSlug}`);
  console.log(`Found ${allItems.length} total item(s) in today's fetcher file.`);

  // ── 2. Load today's status file ──────────────────────────────────────────
  let { statusData, resolvedSet, sentSet } = loadStatus(topicSlug, today);


  // ── Command: list ─────────────────────────────────────────────
  if (action === "l1") {
    console.log(`\n/list command received (rss-picker)`);

    const sent = await sendFullRssList(allItems, resolvedSet, statusData, topic, discordWebhookUrl);

    console.log(`✅ RSS list sent (${sent} message(s))`);
    return;
  }

  // ── 3. Process manual command (.apr N or .del N) ─────────────────────────
  if (action !== null && itemIndex !== null) {
    const fetcherIndex = Number(itemIndex); // convert 1-based → 0-based

    if (fetcherIndex < 0 || fetcherIndex >= allItems.length) {
      console.log(
        `item_index (${itemIndex}) out of range. ` +
        `Fetcher has ${allItems.length} item(s) (valid range: 1–${allItems.length}).`
      );
      return;
    }

    if (resolvedSet.has(fetcherIndex)) {
      console.log(
        `Item ${itemIndex} (fetcher_index: ${fetcherIndex}) is already resolved. Skipping.`
      );
      return;
    }

    const item = allItems[fetcherIndex];

    if (action === "apr") {
      // Approve manually — bypass AI
      console.log(`\n.apr received for item ${itemIndex}: "${item.title}"`);

      // Append to today's approved file
      appendToApproved(topicSlug, today, [
        {
          title: stripHtmlTags(item.title),
          link: sanitizeGoogleLink(item.link),
          published: item.published || null,
          source: item.source,
          score: 10,
          approved_at: new Date().toISOString(),
        },
      ]);

      // Mark as resolved in status
      statusData = addToStatus(statusData, fetcherIndex, "approved");
      saveStatus(topicSlug, today, statusData);

      console.log(`✅ Item ${itemIndex} manually approved and added to approved file.`);
      return;
    }

    if (action === "del") {
      // Delete manually — just mark in status, do not touch approved file
      console.log(`\n.del received for item ${itemIndex}: "${item.title}"`);

      statusData = addToStatus(statusData, fetcherIndex, "deleted");
      saveStatus(topicSlug, today, statusData);

      console.log(`🗑️  Item ${itemIndex} marked as deleted. Will not appear again.`);
      return;
    }

    console.log(`Unknown action "${action}". Valid actions: apr, del.`);
    return;
  }

  // ── 4. Filter unresolved items ───────────────────────────────────────────
  // Attach the original fetcher index to each item before filtering.
  const unresolvedItems = allItems
    .map((item, idx) => ({ ...item, fetcherIndex: idx }))
    .filter((item) => !resolvedSet.has(item.fetcherIndex));

  console.log(`Unresolved items: ${unresolvedItems.length} (resolved: ${resolvedSet.size})`);

  // ── 5. Check minimum threshold ───────────────────────────────────────────
  console.log(`Minimum items required to run AI triage: ${minItems}`);

  if (unresolvedItems.length < minItems) {
    // Only send items that have not been sent to Discord in a previous run
    const newItems = unresolvedItems.filter(
      (item) => !sentSet.has(item.fetcherIndex)
    );

    if (newItems.length > 0) {
      const sentCount = await sendInChunks(newItems, topic, discordWebhookUrl);
      console.log(`Discord notified with ${newItems.length} new item(s) in ${sentCount} message(s).`);

      // Persist the newly-sent indices so they are never re-sent
      for (const item of newItems) {
        sentSet.add(item.fetcherIndex);
      }
      statusData = { ...statusData, sent: Array.from(sentSet) };
      saveStatus(topicSlug, today, statusData);
    } else {
      console.log("No new items to notify. Nothing to do.");
    }

    console.log(
      `Below minimum threshold (${unresolvedItems.length} < ${minItems}). ` +
      `Waiting for more items or manual commands. Exiting.`
    );
    return;
  }

  // ── 6. Deduplicate by real URL ───────────────────────────────────────────
  const seen = new Set();
  const deduplicated = unresolvedItems.filter((item) => {
    const url = extractRealUrl(item.link);
    if (seen.has(url)) { return false; }
    seen.add(url);
    return true;
  });

  const removedDupes = unresolvedItems.length - deduplicated.length;
  if (removedDupes > 0) {
    console.log(`Removed ${removedDupes} duplicate(s) before AI triage.`);
  }

  // Build link → fetcherIndex map so we can write status after AI responds
  const linkToFetcherIndex = {};
  for (const item of deduplicated) {
    linkToFetcherIndex[extractRealUrl(item.link)] = item.fetcherIndex;
  }

  // ── 7. Prepare items for AI ──────────────────────────────────────────────
  const itemsForAI = deduplicated.map((item) => ({
    title: stripHtmlTags(item.title),
    link: item.link,
    published: item.published,
    source: item.source,
    summary: stripHtmlTags(item.summary),
  }));

  console.log(`\nSending ${itemsForAI.length} item(s) to Sonar for triage...`);

  // ── 8. Call AI ───────────────────────────────────────────────────────────
  const { artifact, usage } = await runPrompt({
    topic,
    items_json: JSON.stringify(itemsForAI, null, 2),
    total_items: itemsForAI.length,
  });

  // ── 9. Print triage results ──────────────────────────────────────────────
  const approvedItems = artifact.results.filter((r) => r.score >= minScore);

  console.log("\n─── Triage Results ──────────────────────────────────────");
  console.log(`Total evaluated: ${itemsForAI.length}`);
  console.log(`Total approved:  ${approvedItems.length}`);

  if (usage?.cost?.total_cost != null) {
    console.log(`Cost:            $${usage.cost.total_cost.toFixed(6)} USD`);
  }

  console.log("\nAll items:");
  for (const result of artifact.results) {
    const isApproved = result.score >= minScore;
    const statusLabel = isApproved ? "✅ APPROVED" : "❌ rejected";
    console.log(`\n${statusLabel} [score: ${result.score}/10]`);
    console.log(`  Title: ${result.title}`);
  }

  // ── 10. Append approved items to today's approved file ───────────────────
  const newApprovedItems = approvedItems.map((item) => ({
    title: item.title,
    link: sanitizeGoogleLink(item.link),
    published: item.published,
    source: item.source,
    score: item.score,
    approved_at: new Date().toISOString(),
  }));

  const savedCount = appendToApproved(topicSlug, today, newApprovedItems);
  console.log(`\nAppended ${savedCount} new item(s) to approved-${topicSlug}-${today}.json`);

  // ── 11. Update status with AI triage results ─────────────────────────────
  // All evaluated items (approved OR rejected) are marked resolved in status,
  // so they are never sent to the AI again or shown in Discord notifications.
  for (const result of artifact.results) {
    const fi = linkToFetcherIndex[extractRealUrl(result.link)];
    if (fi === undefined) {
      console.log(`Warning: could not find fetcher_index for link: ${result.link}`);
      continue;
    }
    if (!resolvedSet.has(fi)) {
      const resultAction = result.score >= minScore ? "approved" : "deleted";
      statusData = addToStatus(statusData, fi, resultAction);
      resolvedSet.add(fi); // keep in-memory set consistent
    }
  }

  saveStatus(topicSlug, today, statusData);
  console.log(`Updated status file for topic "${topicSlug}".`);

  // ── 12. Delete files older than 7 days ───────────────────────────────────
  const pickerDir = path.resolve("artifacts/rss-picker");
  const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const deletedFiles = [];

  for (const file of fs.readdirSync(pickerDir)) {
    // Matches both approved-<slug>-<date>.json and status-<slug>-<date>.json
    const match = file.match(/^(?:approved|status)-.+-(\d{4}-\d{2}-\d{2})\.json$/);
    if (!match) { continue; }
    const fileDate = new Date(match[1]);
    if (fileDate < cutoffDate) {
      fs.unlinkSync(path.join(pickerDir, file));
      deletedFiles.push(file);
    }
  }

  if (deletedFiles.length > 0) {
    console.log(`\nCleaned up ${deletedFiles.length} file(s) older than 7 days:`);
    deletedFiles.forEach((f) => console.log(`  - ${f}`));
  }

  // ── 13. Final summary ────────────────────────────────────────────────────
  console.log("─────────────────────────────────────────────────────────");
  console.log(`✅ Done!`);
  console.log(`   ${savedCount} new item(s) added to today's approved file.`);
  console.log(`   Next step: run the article-writer task with approved-${topicSlug}-${today}.json.`);
}

// ── Status file helpers ───────────────────────────────────────────────────────

const DISCORD_MSG_MAX_LENGTH = 1800;

/**
 * Load today's status file.
 * Returns { statusData, resolvedSet, sentSet } where:
 *   resolvedSet — Set<number> of fetcher_index values already resolved (approved/deleted)
 *   sentSet     — Set<number> of fetcher_index values already sent to Discord
 */
function loadStatus(topicSlug, today) {
  const statusPath = path.resolve(
    `artifacts/rss-picker/status-${topicSlug}-${today}.json`
  );

  if (!fs.existsSync(statusPath)) {
    return {
      statusData: {
        topic_slug: topicSlug,
        date: today,
        resolved: [],
        sent: [],
      },
      resolvedSet: new Set(),
      sentSet: new Set(),
    };
  }

  const statusData = JSON.parse(fs.readFileSync(statusPath, "utf-8"));
  const resolvedSet = new Set((statusData.resolved || []).map((r) => r.fetcher_index));
  const sentSet = new Set(statusData.sent || []);

  return { statusData, resolvedSet, sentSet };
}

/**
 * Persist the status object to disk.
 */
function saveStatus(topicSlug, today, statusData) {
  const statusPath = path.resolve(
    `artifacts/rss-picker/status-${topicSlug}-${today}.json`
  );
  fs.writeFileSync(statusPath, JSON.stringify(statusData, null, 2), "utf-8");
}

/**
 * Add a single resolved entry to statusData.
 * Does NOT write to disk — call saveStatus() after.
 */
function addToStatus(statusData, fetcherIndex, action) {
  return {
    ...statusData,
    resolved: [
      ...(statusData.resolved || []),
      {
        fetcher_index: fetcherIndex,
        action,
        resolved_at: new Date().toISOString(),
      },
    ],
  };
}

// ── Approved file helper ──────────────────────────────────────────────────────

/**
 * Append new approved items to today's approved file.
 * Skips items whose real URL is already in the file (deduplication across runs).
 * Returns the number of items actually written.
 */
function appendToApproved(topicSlug, today, newItems) {
  const filePath = path.resolve(
    `artifacts/rss-picker/approved-${topicSlug}-${today}.json`
  );

  let existing = [];
  if (fs.existsSync(filePath)) {
    existing = JSON.parse(fs.readFileSync(filePath, "utf-8")).items || [];
  }

  const savedLinks = new Set(existing.map((i) => extractRealUrl(i.link)));
  const toAdd = newItems.filter((item) => !savedLinks.has(extractRealUrl(item.link)));

  if (toAdd.length === 0) {
    console.log("No new approved items to write (all already present).");
    return 0;
  }

  const updated = {
    topic_slug: topicSlug,
    date: today,
    total_approved: existing.length + toAdd.length,
    items: [...existing, ...toAdd],
  };

  fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), "utf-8");
  return toAdd.length;
}

// ── URL & text helpers ────────────────────────────────────────────────────────

/**
 * Extract the real destination URL from a Google redirect URL.
 * Google Alerts wraps links like: https://www.google.com/url?...&url=REAL_URL&...
 * Used for deduplication.
 */
function extractRealUrl(link) {
  try {
    const parsed = new URL(link);
    const realUrl = parsed.searchParams.get("url");
    return realUrl ? decodeURIComponent(realUrl) : link;
  } catch {
    return link;
  }
}

/**
 * Extract the real URL only for Google redirect links; otherwise return as-is.
 * Used when writing links to approved files.
 */
function sanitizeGoogleLink(link) {
  try {
    if (typeof link !== "string") { return link; }
    if (!link.startsWith("https://www.google.com/url?")) { return link; }
    const urlObj = new URL(link);
    const realUrl = urlObj.searchParams.get("url");
    return realUrl ? decodeURIComponent(realUrl) : link;
  } catch {
    return link;
  }
}

/**
 * Strip HTML tags and decode common HTML entities from a string.
 * RSS feeds (especially Google Alerts) include <b> tags and &quot; etc.
 */
function stripHtmlTags(str = "") {
  return str
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .trim();
}

/**
 * Format a date string as dd-mmm-yyyy hh:mm:ss (pt-BR month abbreviations).
 */
function formatDate(dateStr) {
  if (!dateStr) { return "sem data"; }
  const date = new Date(dateStr);
  if (isNaN(date)) { return dateStr; }
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = meses[date.getMonth()];
  const yyyy = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${dd}-${mm}-${yyyy} ${hh}:${min}:${ss}`;
}

/**
 * Build a formatted text block for a single unresolved item.
 */
function buildItemBlock(item) {
  const displayIndex = item.fetcherIndex;
  const safeTitle = truncate(stripHtmlTags(item.title), 300);
  const safeLink = truncate(sanitizeGoogleLink(item.link), 500);
  return `\n**[${displayIndex}] ${safeTitle}** (${formatDate(item.published)}) - [Link](<${safeLink}>)\n`;
}

/**
 * Send a list of items to Discord, splitting into multiple messages
 * if the content exceeds the 2000 character limit.
 * Only receives items that are genuinely new (not yet sent).
 */
async function sendInChunks(items, topic, discordWebhookUrl) {
  let sentMessages = 0;

  const safeTopic = truncate(topic, 100);
  const firstHeader = `🆕 Itens pendentes para o tópico "${safeTopic}":\n> .apr <N> ou .del <N>\n`;
  const continuationHeader = `🔁 Continuando...\n`;

  let currentMsg = firstHeader;

  for (const item of items) {
    const itemBlock = buildItemBlock(item);

    if ((currentMsg + itemBlock).length > DISCORD_MSG_MAX_LENGTH) {
      await notifyDiscord(currentMsg, discordWebhookUrl);
      sentMessages++;
      currentMsg = continuationHeader + itemBlock;
    } else {
      currentMsg += itemBlock;
    }
  }

  if (currentMsg.trim()) {
    await notifyDiscord(currentMsg, discordWebhookUrl);
    sentMessages++;
  }

  return sentMessages;
}

/**
 * Truncate a string to a maximum length, adding ellipsis if needed.
 */
function truncate(text, max = 100) {
  if (typeof text !== "string") { return text; }
  return text.length > max ? text.slice(0, max) + "..." : text;
}

async function sendFullRssList(allItems, resolvedSet, statusData, topic, discordWebhookUrl) {
  let sentMessages = 0;

  const safeTopic = truncate(topic, 100);

  const header =
    `📋 Lista completa — "${safeTopic}":\n` +
    `> .apr <N> | .del <N>\n`;

  const continuation = `🔁 Continuação da lista:\n`;

  let currentMsg = header;

  // cria mapa rápido de status
  const statusMap = new Map();
  for (const r of statusData.resolved || []) {
    statusMap.set(r.fetcher_index, r.action);
  }

  // percorre TODOS os itens (ordem original)
  for (let i = 0; i < allItems.length; i++) {
    const item = allItems[i];

    const action = statusMap.get(i);

    let icon = "🆕";
    if (action === "approved") icon = "✅";
    if (action === "deleted") icon = "🗑️";

    const title = truncate(stripHtmlTags(item.title), 120);
    const line = `\n${icon} [${i}] ${title}`;

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

  return sentMessages;
}
