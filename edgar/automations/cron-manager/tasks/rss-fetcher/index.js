import Parser from "rss-parser";
import { DEFAULT_FEEDS, parseCustomFeeds } from "./feeds.js";
import fs from "fs";
import path from "path";

/**
 * rss-fetcher task
 *
 * Fetches news from RSS feeds, filters by topic relevance,
 * and saves a raw_news.json artifact for downstream tasks
 * (e.g. an article writer task) to consume.
 *
 * Inputs:
 *   topic            - keyword/topic to filter articles (required)
 *   patterns         - optional semicolon-separated positive match patterns
 *   exclude_patterns - optional semicolon-separated negative patterns
 *   feeds            - comma-separated RSS URLs (optional, uses defaults if empty)
 *   max_items        - max articles to collect total (default: 10)
 *   language         - preferred language: 'pt', 'en', 'es' (default: 'pt')
 *   since_hours      - only include items from the last X hours, 0 = disabled (default: 0)
 *   category         - filter default feeds by category: general, technology, finance, business (default: all)
 */
export default async function (context) {
  // ─── context properties ────────────────────────────────────────────────────
  //   taskName     — string, name of this task
  //   mode         — "manual" | "cron"
  //   executionId  — unique UUID for this run (useful for dynamic artifact names)
  //   inputs       — values declared in task.config.yaml inputs[]
  //                  e.g. context.inputs.topic
  //   env          — env vars declared in task.config.yaml env_vars{}
  //                  e.g. context.env.MY_API_KEY
  //   runPrompt    — async fn — only available when --template was selected (see below)
  //                  not used in this task (pure RSS fetch, no AI call)
  //   saveArtifact — fn(name, data) — writes JSON to artifacts/rss-fetcher/<n>.json
  const { taskName, mode, executionId, inputs, saveArtifact } = context;

  console.log(`Task: ${taskName} | Mode: ${mode} | ID: ${executionId}`);

  // ── runPrompt is not called here ──────────────────────────────────────────
  // This task is a pure RSS fetcher — no AI prompt is needed at this stage.
  // runPrompt will be used in downstream tasks (e.g. feed-selector, article-writer)
  // that consume the raw_news.json artifact produced here.
  //
  // When runPrompt IS used, it works like this:
  //
  //   runPrompt(extraVars?) — renders the prompt template, calls the AI,
  //   validates against schema.js, and returns a result object.
  //   Task inputs (e.g. inputs.topic) are auto-injected as {{topic}} in user.md.
  //
  //   const { artifact, citations, searchResults, usage } = await runPrompt();
  //   const { artifact } = await runPrompt({ date_today: new Date().toISOString().slice(0, 10) });
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
  //   result.model    — model string used (e.g. "sonar-pro", "gpt-4o")
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

  const topic = (inputs.topic || "").trim().toLowerCase();
  const maxItems = Number(inputs.max_items) || 10;
  const language = (inputs.language || "pt").trim().toLowerCase();
  const customFeedsRaw = (inputs.feeds || "").trim();
  const sinceHours = Number(inputs.since_hours) || 0;
  const category = (inputs.category || "").trim().toLowerCase();

  // Positive patterns (manual overrides topic matching)
  const customPatterns = (inputs.patterns || "")
    .split(";")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);

  const topicPatterns =
    customPatterns.length > 0
      ? customPatterns
      : topic
        ? topic.split(";").map((p) => p.trim().toLowerCase()).filter(Boolean)
        : [];

  if (topicPatterns.length === 0) {
    throw new Error("You must provide topic or patterns.");
  }

  // Negative patterns (noise reduction)
  const excludePatterns = (inputs.exclude_patterns || "")
    .split(";")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);

  // ── 1. Resolve feed list ─────────────────────────────────────────────────
  let feedList;

  if (customFeedsRaw) {
    feedList = parseCustomFeeds(customFeedsRaw);
    console.log(`Using ${feedList.length} custom feed(s) provided via input.`);
  } else {
    feedList = DEFAULT_FEEDS.filter((f) => {
      const langMatch = f.lang === language || f.lang === "unknown";
      // If category is set, also filter by category; otherwise accept all
      const categoryMatch = category ? f.category === category : true;
      return langMatch && categoryMatch;
    });

    const categoryLabel = category ? `category '${category}', ` : "";

    console.log(
      `Using ${feedList.length} default feed(s) for ${categoryLabel}language '${language}'.`
    );
  }

  // ── 2. Compute date cutoff ────────────────────────────────────────────────
  const sinceCutoff =
    sinceHours > 0
      ? new Date(Date.now() - sinceHours * 60 * 60 * 1000)
      : null;

  if (sinceCutoff) {
    console.log(
      `Only including items published after: ${sinceCutoff.toISOString()} (last ${sinceHours}h)`
    );
  }

  // ── 3. RSS parser ─────────────────────────────────────────────────────────
  const parser = new Parser({
    timeout: 10000,
    headers: { "User-Agent": "rss-fetcher-bot/1.0" },
  });

  console.log(`\nSearching for topic: "${inputs.topic}"`);
  console.log(`Patterns: ${topicPatterns.join(", ")}`);

  if (excludePatterns.length > 0) {
    console.log(`Exclude patterns: ${excludePatterns.join(", ")}`);
  }

  console.log(`Max items to collect: ${maxItems}\n`);

  const collectedItems = [];
  const errors = [];

  // ── 4. Fetch feeds ────────────────────────────────────────────────────────
  for (const feed of feedList) {
    if (collectedItems.length >= maxItems * 2) break;

    try {
      process.stdout.write(`Fetching: ${feed.name} ... `);

      const parsed = await parser.parseURL(feed.url);
      const items = parsed.items || [];

      const relevant = items
        .map((item) => {
          const title = (item.title || "").toLowerCase();

          // contentSnippet, summary, and content can be noisy and often contain boilerplate or unrelated text.
          // For relevance scoring, we focus on the title, which is more likely to reflect the main topic.
          const body = [
            // item.contentSnippet || "",
            // item.summary || "", // summary is often refering other articles and adds noise, so we skip it for now
            // item.content || "",
          ]
            .join(" ")
            .toLowerCase();

          let score = 0;

          const topicRegexes = topicPatterns.map((pattern) => {
            const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            return new RegExp(escaped, "i");
          });

          const excludeRegexes = excludePatterns.map((pattern) => {
            const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            return new RegExp(escaped, "i");
          });


          for (const regex of topicRegexes) {
            if (regex.test(title)) score += 2;
            if (regex.test(body)) score += 1;
          }

          for (const regex of excludeRegexes) {
            if (regex.test(title)) score -= 2;
            if (regex.test(body)) score -= 1;
          }

          // Minimum relevance threshold
          if (score < 2) {
            console.log(`  [skip] score=${score} "${item.title?.slice(0, 80)}"`);
            return null;
          }

          // Date filtering
          if (sinceCutoff) {
            const pubDate = item.isoDate || item.pubDate;
            if (!pubDate) return null;
            
            const parsedDate = new Date(pubDate);

            if (isNaN(parsedDate.getTime())) return null;
            if (parsedDate < sinceCutoff) return null;
            
          }

          return { item, score };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score);



      console.log(`${items.length} items found, ${relevant.length} relevant.`);

      for (const { item, score } of relevant) {
        if (collectedItems.length >= maxItems * 2) break;

        collectedItems.push({
          title: item.title || "",
          link: item.link || "",
          published: item.isoDate || item.pubDate || null,
          summary: item.contentSnippet || item.summary || "",
          source: feed.name,
          source_url: feed.url,
          language: feed.lang,
          category: feed.category,
          score,
          fetched_at_item: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.log(`ERROR — ${err.message}`);
      errors.push({
        feed: feed.name,
        url: feed.url,
        error: err.message,
      });
    }
  }

  // ── 5. Remove duplicates ─────────────────────────────────────────────
  const unique = new Map();

  for (const item of collectedItems) {
    const key = item.link || item.title;

    if (!unique.has(key)) {
      unique.set(key, item);
    }
  }

  const finalItems = Array.from(unique.values()).slice(0, maxItems);

  // ── 5. Sort by score first, then newest date ─────────────────────────────
  finalItems.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;

    const da = a.published ? new Date(a.published) : 0;
    const db = b.published ? new Date(b.published) : 0;

    return db - da;
  });

  // ── 6. Build artifact ─────────────────────────────────────────────────────
  const artifact = {
    topic: inputs.topic,
    patterns: topicPatterns,
    exclude_patterns: excludePatterns,
    language,
    category: category || "all",
    since_hours: sinceHours || "disabled",
    fetched_at: new Date().toISOString(),
    total_feeds_attempted: feedList.length,
    total_feeds_failed: errors.length,
    total_items_collected: finalItems.length,
    items: finalItems,
    errors: errors.length > 0 ? errors : undefined,
  };

  // ── 7. Print summary ──────────────────────────────────────────────────────
  console.log("\n─── Summary ─────────────────────────────────────────────");
  console.log(`Topic:          ${artifact.topic}`);
  console.log(`Language:       ${artifact.language}`);
  console.log(`Category:       ${artifact.category}`);
  console.log(`Since hours:    ${artifact.since_hours}`);
  console.log(`Feeds fetched:  ${artifact.total_feeds_attempted}`);
  console.log(`Feeds failed:   ${artifact.total_feeds_failed}`);
  console.log(`Items found:    ${artifact.total_items_collected}`);
  console.log("─────────────────────────────────────────────────────────\n");

  if (finalItems.length === 0) {
    console.warn(
      "No items found for this topic. Try broader patterns, fewer exclusions, a larger since_hours window, or more feeds."
    );
  } else {
    for (const item of finalItems) {
      const date = item.published
        ? new Date(item.published).toLocaleDateString("pt-BR")
        : "no date";

      console.log(`• [${date}] score=${item.score} ${item.title}`);
      console.log(`  ${item.source} — ${item.link}`);
    }
  }

  // ── 8. Save artifact ──────────────────────────────────────────────────────
  // Salva um arquivo por id+data: raw_news-<id>-YYYY-MM-DD.json
  const today = new Date().toISOString().slice(0, 10); // "2026-04-08"
  const inputId = (inputs.id || "").trim();
  const artifactName = inputId ? `${inputId}-${today}` : `raw_news-${today}`;
  await saveArtifact(artifactName, artifact);

  console.log(`\nArtifact saved: ${artifactName}.json`);
  console.log("Next step: run the article-writer task consuming this artifact.");

  // ── 9. Cleanup: remove arquivos antigos (>7 dias) ─────────────────────────────

  const artifactsDir = path.resolve("artifacts/rss-fetcher");
  const keepDays = 7;
  const now = new Date();

  try {
    const files = fs.readdirSync(artifactsDir);
    for (const file of files) {
      const match = file.match(/^raw_news-(\d{4}-\d{2}-\d{2})\.json$/);
      if (match) {
        const fileDate = new Date(match[1]);
        const diffDays = (now - fileDate) / (1000 * 60 * 60 * 24);
        if (diffDays > keepDays) {
          fs.unlinkSync(path.join(artifactsDir, file));
          console.log("Deleted old artifact:", file);
        }
      }
    }
  } catch (err) {
    console.warn("[cleanup] Failed to delete old artifacts:", err.message);
  }
}
