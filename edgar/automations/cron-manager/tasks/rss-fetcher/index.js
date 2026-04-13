import Parser from "rss-parser";
import { DEFAULT_FEEDS, parseCustomFeeds } from "./feeds.js";
import fs from "fs";
import path from "path";
import he from "he";

// ── HTML utilities ────────────────────────────────────────────────────────────

/**
 * Strips HTML tags and decodes HTML entities from a string.
 * Uses `he` for robust entity decoding (covers &#8217;, &mdash;, etc.)
 * then removes any remaining tags.
 */
function stripHtml(str) {
  if (!str) return "";
  return he
    .decode(str)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Scoring utilities ─────────────────────────────────────────────────────────

/**
 * Checks if ALL words of a pattern appear in the text (order-independent).
 * "visto americano" matches "novo visto para entrar nos EUA americano".
 */
function matchesAllWords(text, pattern) {
  const words = pattern.split(/\s+/).filter(Boolean);
  return words.every((word) => new RegExp(word, "i").test(text));
}

/**
 * Returns a proximity bonus when all pattern words appear within
 * a window of `windowSize` words in the text.
 * Bonus = 1 if words are close, 0 otherwise.
 */
function proximityBonus(text, pattern, windowSize = 8) {
  const patternWords = pattern.split(/\s+/).filter(Boolean);
  if (patternWords.length < 2) return 0;

  const textWords = text.split(/\s+/);

  for (let i = 0; i < textWords.length; i++) {
    const window = textWords.slice(i, i + windowSize).join(" ");
    if (patternWords.every((w) => new RegExp(w, "i").test(window))) {
      return 1;
    }
  }
  return 0;
}

/**
 * Scores a text against a single pattern using:
 *  +2  exact phrase match
 *  +2  all words present (order-independent)
 *  +1  proximity bonus (words within windowSize words of each other)
 */
function scorePattern(text, pattern) {
  if (!text || !pattern) return 0;

  const exactRegex = new RegExp(
    pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    "i"
  );

  let score = 0;

  if (exactRegex.test(text)) {
    score += 2; // exact phrase
  } else if (matchesAllWords(text, pattern)) {
    score += 2; // all words present, any order
    score += proximityBonus(text, pattern); // +1 if words are close
  }

  return score;
}

/**
 * export default async function (context) — rss-fetcher task
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
  const { taskName, mode, executionId, inputs, saveArtifact } = context;

  console.log(`Task: ${taskName} | Mode: ${mode} | ID: ${executionId}`);

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
    requestOptions: { agent: false },
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
          // Improvement 1 & 2: strip HTML tags + decode entities before matching
          const title = stripHtml(item.title || "").toLowerCase();
          const body = ""; // reserved for future use

          let score = 0;

          // Positive patterns — Improvements 3 & 4: word tokenization + proximity
          for (const pattern of topicPatterns) {
            score += scorePattern(title, pattern) * 2; // title weight x2
            if (body) score += scorePattern(body, pattern);
          }

          // Negative patterns — same logic, subtracts score
          for (const pattern of excludePatterns) {
            const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const regex = new RegExp(escaped, "i");
            if (regex.test(title)) score -= 2;
            if (body && regex.test(body)) score -= 1;
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

          return { item, score, cleanTitle: title };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score);

      console.log(`${items.length} items found, ${relevant.length} relevant.`);

      for (const { item, score, cleanTitle } of relevant) {
        if (collectedItems.length >= maxItems * 2) break;

        collectedItems.push({
          title: cleanTitle || stripHtml(item.title || ""), // always clean title
          link: item.link || "",
          published: item.isoDate || item.pubDate || null,
          summary: stripHtml(item.contentSnippet || item.summary || ""),
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
      errors.push({ feed: feed.name, url: feed.url, error: err.message });
    }
  }

  // ── 5. Remove duplicates ──────────────────────────────────────────────────
  const unique = new Map();
  for (const item of collectedItems) {
    const key = item.link || item.title;
    if (!unique.has(key)) unique.set(key, item);
  }

  const finalItems = Array.from(unique.values()).slice(0, maxItems);

  // ── 6. Sort by score, then newest date ───────────────────────────────────
  finalItems.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const da = a.published ? new Date(a.published) : 0;
    const db = b.published ? new Date(b.published) : 0;
    return db - da;
  });

  // ── 7. Build artifact ─────────────────────────────────────────────────────
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

  // ── 8. Print summary ──────────────────────────────────────────────────────
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

  // ── 9. Save artifact ──────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const inputId = (inputs.id || "").trim();
  const artifactName = inputId ? `${inputId}-${today}` : `raw_news-${today}`;
  await saveArtifact(artifactName, artifact);

  console.log(`\nArtifact saved: ${artifactName}.json`);
  console.log("Next step: run the article-writer task consuming this artifact.");

  // ── 10. Cleanup: remove arquivos antigos (>7 dias) ───────────────────────
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
