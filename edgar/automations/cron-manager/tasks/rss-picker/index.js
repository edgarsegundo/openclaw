import fs from "fs";
import path from "path";
import slugify from "slugify";

/**
 * rss-picker task
 *
 * Reads today's raw_news artifact from rss-fetcher, filters only items newer
 * than the last run, and sends them to Sonar Small (Perplexity) for relevance
 * triage. Approved items are appended to a daily file. Files older than 7 days
 * are deleted automatically at the end of each run.
 *
 * Inputs:
 *   rss_fetcher_output_artifact_file_name_pattern - path pattern with {date} placeholder (required)
 *                   e.g. "artifacts/rss-fetcher/rss-artifact-visto-americano-{date}.json"
 *   blog_context  - description of your blog and audience (optional)
 *   min_items     - minimum new items required to trigger AI triage (default: 3)
 *   min_score     - minimum relevance score 0-10 to approve an item (default: 7)
 *
 * State file:
 *   artifacts/rss-picker/last_run.json — tracks last execution per topic slug
 *   Structure: { "visto-americano": { last_run_at, items_evaluated, items_approved }, ... }
 *
 * Daily approved files:
 *   artifacts/rss-picker/approved-{topic_slug}-{YYYY-MM-DD}.json
 *   Each day gets its own file. Multiple runs on the same day append to it.
 *   Files older than 7 days are deleted automatically.
 *
 * Template:
 *   feed-selector — uses Perplexity sonar (small) to evaluate and score each item
 */
export default async function (context) {
  // ─── context properties ────────────────────────────────────────────────────
  //   taskName     — string, name of this task
  //   mode         — "manual" | "cron"
  //   executionId  — unique UUID for this run (useful for dynamic artifact names)
  //   inputs       — values declared in task.config.yaml inputs[]
  //                  e.g. context.inputs.rss_fetcher_output_artifact_file_name_pattern
  //   env          — env vars declared in task.config.yaml env_vars{}
  //                  e.g. context.env.PERPLEXITY_API_KEY
  //   runPrompt    — async fn — renders template, calls AI, validates via schema.js
  //   saveArtifact — fn(name, data) — writes JSON to artifacts/rss-picker/<n>.json
  const { taskName, mode, executionId, inputs, runPrompt, saveArtifact } = context;

  console.log(`Task: ${taskName} | Mode: ${mode} | ID: ${executionId}`);

  // ── runPrompt(extraVars?) ─────────────────────────────────────────────────
  // Renders the prompt template, calls the AI, validates against schema.js,
  // and returns a result object. The template is selected via --template or
  // interactively at runtime.
  //
  // Task inputs (e.g. inputs.blog_context) are auto-injected as {{blog_context}} in user.md.
  // Pass extraVars to add/override variables not declared in task inputs:
  //
  //   const result = await runPrompt({ topic: "visto americano", items_json: "..." });
  //
  // ── result fields ────────────────────────────────────────────────────────
  //
  //   result.artifact
  //     The validated JSON object defined by schema.js.
  //     Shape depends on your schema — this is the main AI output.
  //
  //   result.citations        (Perplexity/sonar only — [] for OpenAI)
  //     string[] of source URLs the model consulted.
  //     Index is 0-based here; citation markers in the text are 1-based:
  //       [1] in text → citations[0]
  //       [2] in text → citations[1]
  //
  //   result.searchResults    (Perplexity/sonar only — [] for OpenAI)
  //     Rich metadata for each source, aligned 1:1 with citations[].
  //     Each entry: { title, url, snippet, date, last_updated, source }
  //     Use this when you want to show source cards (title + snippet)
  //     instead of bare URLs.
  //
  //   result.usage            (Perplexity/sonar only — basic tokens for OpenAI)
  //     Token counts + cost breakdown.
  //     Key fields:
  //       usage.prompt_tokens      — input tokens consumed
  //       usage.completion_tokens  — output tokens generated
  //       usage.cost.total_cost    — total cost in USD (Perplexity only)
  //       usage.cost.search_queries_cost — cost of web searches (Perplexity only)
  //
  //   result.model    — model string used (e.g. "sonar", "gpt-4o")
  //   result.template — template name used for this call
  //
  // ── saveArtifact usage examples ──────────────────────────────────────────
  //
  // Add runtime metadata:
  //   const enriched = { ...artifact, generated_at: new Date().toISOString() };
  //   await saveArtifact("result", enriched);
  //
  // Dynamic filename from artifact field:
  //   const slug = artifact.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
  //   await saveArtifact(`article-${slug}`, artifact);
  //
  // Save multiple artifacts from one run:
  //   await saveArtifact("summary", { title: artifact.title, tags: artifact.tags });
  //   await saveArtifact("full", artifact);
  //
  // Save source metadata alongside the artifact (useful for Perplexity tasks):
  //   await saveArtifact("result", artifact);
  //   if (searchResults.length) await saveArtifact("sources", searchResults);
  //
  // Skip saving — just send to an external API:
  //   await sendToExternalApi(artifact);

  const minItems = Number(inputs.min_items) || 3;
  const minScore = Number(inputs.min_score) || 7;

  // ── 1. Resolve today's raw_news file path ────────────────────────────────
  // Pattern from input: "artifacts/rss-fetcher/rss-artifact-visto-americano-{date}.json"
  // {date} is replaced with today's date dynamically
  const today = new Date().toISOString().slice(0, 10);
  const rawNewsPath = path.resolve(
    inputs.rss_fetcher_output_artifact_file_name_pattern.replace("{date}", today)
  );

  console.log(`\nLooking for today's file: ${rawNewsPath}`);

  if (!fs.existsSync(rawNewsPath)) {
    console.log("File not found. rss-fetcher may not have run yet today. Exiting.");
    return;
  }

  const rss_fetcher_output_artifact_dict = JSON.parse(fs.readFileSync(rawNewsPath, "utf-8"));

  const allItems = rss_fetcher_output_artifact_dict.items || [];
  const topic = rss_fetcher_output_artifact_dict.topic;
  const topicSlug = slugify(topic, { lower: true });

  console.log(`Topic: ${topic}`);
  console.log(`Topic slug: ${topicSlug}`);
  console.log(`Found ${allItems.length} total item(s) in today's file.`);

  // ── 2. Load last_run.json and get last execution timestamp for this topic ─
  // last_run.json is a registry keyed by topic_slug so multiple topics
  // can run independently without overwriting each other's state.
  const lastRunPath = path.resolve("artifacts/rss-picker/last_run.json");
  let lastRunRegistry = {};

  // ← aqui, garante que a pasta existe antes de qualquer leitura/escrita
  fs.mkdirSync(path.resolve("artifacts/rss-picker"), { recursive: true });  

  if (fs.existsSync(lastRunPath)) {
    lastRunRegistry = JSON.parse(fs.readFileSync(lastRunPath, "utf-8"));
  }

  const lastRunEntry = lastRunRegistry[topicSlug] || null;
  const lastRunAt = lastRunEntry?.last_run_at
    ? new Date(lastRunEntry.last_run_at)
    : null;

  if (lastRunAt) {
    console.log(`Last run for "${topicSlug}": ${lastRunAt.toISOString()}`);
  } else {
    console.log(`No previous run found for "${topicSlug}". Will evaluate all items.`);
  }

  // ── 3. Filter: only items newer than last run ────────────────────────────
  const newItems = allItems.filter((item) => {
    if (!lastRunAt) return true; // no previous run → all items are new
    if (!item.published) return false; // no date → skip to be safe
    return new Date(item.published) > lastRunAt;
  });

  console.log(`New items since last run: ${newItems.length}`);

  // ── 4. Check minimum threshold ───────────────────────────────────────────
  if (newItems.length < minItems) {
    console.log(
      `Below minimum threshold (${newItems.length} < ${minItems}). ` +
      `Waiting for more items. Exiting.`
    );
    return;
  }

  // ── 5. Deduplicate by real URL ───────────────────────────────────────────
  // Same story from multiple feeds = keep only the first occurrence.
  // Google Alerts wraps links in redirect URLs — extract the real destination.
  const seen = new Set();
  const deduplicated = newItems.filter((item) => {
    const url = extractRealUrl(item.link);
    if (seen.has(url)) return false;
    seen.add(url);
    return true;
  });

  const removedDupes = newItems.length - deduplicated.length;
  if (removedDupes > 0) {
    console.log(`Removed ${removedDupes} duplicate(s) before AI triage.`);
  }

  // ── 6. Prepare clean items to send to AI ────────────────────────────────
  // Strip HTML tags and entities — Google Alerts includes <b> tags in titles.
  const itemsForAI = deduplicated.map((item) => ({
    title: stripHtmlTags(item.title),
    link: item.link,
    published: item.published,
    source: item.source,
    summary: stripHtmlTags(item.summary),
  }));

  console.log(`\nSending ${itemsForAI.length} item(s) to Sonar for triage...`);

  // ── 7. Call AI via runPrompt ─────────────────────────────────────────────
  // Task inputs auto-injected: blog_context, min_score
  // Extra vars passed here:
  //   topic       — human-readable topic name from the raw_news artifact
  //   items_json  — serialized list of items for the AI to evaluate
  //   total_items — count of items, injected as {{total_items}} in user.md
  const { artifact, usage } = await runPrompt({
    topic,
    items_json: JSON.stringify(itemsForAI, null, 2),
    total_items: itemsForAI.length,
  });

  // ── 8. Print triage results ──────────────────────────────────────────────
  const approvedItems = artifact.results.filter((r) => r.score >= minScore);

  console.log("\n─── Triage Results ──────────────────────────────────────");
  console.log(`Total evaluated: ${itemsForAI.length}`);
  console.log(`Total approved:  ${approvedItems.length}`);

  if (usage?.cost?.total_cost != null) {
    console.log(`Cost:            $${usage.cost.total_cost.toFixed(6)} USD`);
  }

  console.log("\nAll items:");
  for (const result of artifact.results) {
    const approved = result.score >= minScore;
    const status = approved ? "✅ APPROVED" : "❌ rejected";
    console.log(`\n${status} [score: ${result.score}/10]`);
    console.log(`  Title:  ${result.title}`);
  }

  // ── 9. Append approved items to today's daily file ───────────────────────
  // File pattern: artifacts/rss-picker/approved-{topic_slug}-{YYYY-MM-DD}.json
  // Each day gets its own file. Multiple runs on the same day append to it,
  // skipping items whose link is already present (deduplication across runs).
  const dailyFilePath = path.resolve(
    `artifacts/rss-picker/approved-${topicSlug}-${today}.json`
  );

  // Load existing daily file if it exists (previous runs today)
  let dailyApproved = [];
  if (fs.existsSync(dailyFilePath)) {
    const existing = JSON.parse(fs.readFileSync(dailyFilePath, "utf-8"));
    dailyApproved = existing.items || [];
  }

  // Build a set of already-saved links to avoid duplicates across runs today
  const savedLinks = new Set(dailyApproved.map((i) => extractRealUrl(i.link)));

  const newApproved = approvedItems
    .filter((item) => !savedLinks.has(extractRealUrl(item.link)))
    .map((item) => ({
      title: item.title,
      link: sanitizeGoogleLink(item.link),
      published: item.published,
      source: item.source,
      score: item.score,
      approved_at: new Date().toISOString(),
    }));

  const skippedDupes = approvedItems.length - newApproved.length;
  if (skippedDupes > 0) {
    console.log(`Skipped ${skippedDupes} already-saved approved item(s).`);
  }

  // Merge and write daily file
  const updatedDaily = {
    topic,
    topic_slug: topicSlug,
    date: today,
    total_approved: dailyApproved.length + newApproved.length,
    items: [...dailyApproved, ...newApproved],
  };

  fs.writeFileSync(dailyFilePath, JSON.stringify(updatedDaily, null, 2), "utf-8");
  console.log(`\nAppended ${newApproved.length} new item(s) to: approved-${topicSlug}-${today}.json`);
  console.log(`Daily total: ${updatedDaily.total_approved} approved item(s).`);

  // ── 10. Delete daily files older than 7 days ─────────────────────────────
  // Only touches approved-{slug}-{date}.json files, not last_run.json or others.
  const pickerArtifactsDir = path.resolve("artifacts/rss-picker");
  const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const allFiles = fs.readdirSync(pickerArtifactsDir);
  const deletedFiles = [];

  for (const file of allFiles) {
    const match = file.match(/^approved-.+-(\d{4}-\d{2}-\d{2})\.json$/);
    if (!match) continue;
    const fileDate = new Date(match[1]);
    if (fileDate < cutoffDate) {
      fs.unlinkSync(path.join(pickerArtifactsDir, file));
      deletedFiles.push(file);
    }
  }

  if (deletedFiles.length > 0) {
    console.log(`\nCleaned up ${deletedFiles.length} file(s) older than 7 days:`);
    deletedFiles.forEach((f) => console.log(`  - ${f}`));
  }

  // ── 11. Update last_run.json registry for this topic ─────────────────────
  // Only updates the key for this topic_slug — other topics are not affected.
  lastRunRegistry[topicSlug] = {
    last_run_at: new Date().toISOString(),
    items_evaluated: itemsForAI.length,
    items_approved: approvedItems.length,
  };

  fs.writeFileSync(lastRunPath, JSON.stringify(lastRunRegistry, null, 2), "utf-8");
  console.log(`Updated last_run.json for topic "${topicSlug}".`);

  // ── 12. Final summary ────────────────────────────────────────────────────
  console.log("─────────────────────────────────────────────────────────");
  console.log(`✅ Done!`);
  console.log(`   ${newApproved.length} new item(s) added to today's approved file.`);
  console.log(`   Next step: run the article-writer task with approved-${topicSlug}-${today}.json.`);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract the real destination URL from a Google redirect URL.
 * Google Alerts wraps links like: https://www.google.com/url?...&url=REAL_URL&...
 * Used for deduplication — two entries pointing to the same article = one item.
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
 * Sanitiza links do Google, extraindo a URL real apenas se for um link do Google.
 * Se não for possível extrair, retorna o link original.
 */
function sanitizeGoogleLink(link) {
  try {
    if (typeof link !== 'string') return link;
    if (!link.startsWith('https://www.google.com/url?')) return link;
    const urlObj = new URL(link);
    const realUrl = urlObj.searchParams.get('url');
    return realUrl ? decodeURIComponent(realUrl) : link;
  } catch {
    return link;
  }
}

/**
 * Strip HTML tags and decode common HTML entities from a string.
 * RSS feeds (especially Google Alerts) often include <b> tags and &quot; etc.
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
