import Parser from "rss-parser";
import { DEFAULT_FEEDS, parseCustomFeeds } from "./feeds.js";
import fs from "fs";
import path from "path";
import he from "he";
import crypto from "crypto";

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

// ── Hash utilities ────────────────────────────────────────────────────────────

/** Normalizes a string for fingerprinting. */
function normalize(str) {
  if (!str) return "";
  return str.toLowerCase().trim().replace(/\s+/g, " ");
}

/** Returns an MD5 hex digest of a string. */
function md5(str) {
  return crypto.createHash("md5").update(str).digest("hex");
}

/**
 * Generates the two fingerprint keys for an item.
 * url_key  — based on item.link  (only when link is non-empty)
 * title_key — based on item.title (always generated)
 */
function fingerprintKeys(item) {
  const titleKey = "title:" + md5(normalize(item.title || ""));
  const urlKey =
    item.link ? "url:" + md5(normalize(item.link)) : null;
  return { titleKey, urlKey };
}

// ── Seen-hashes persistence ───────────────────────────────────────────────────

const SEEN_HASHES_FILENAME = "seen_hashes.json";

/**
 * Loads the seen-hashes map from disk, purges entries older than keepDays,
 * and returns the resulting object.
 * Returns an empty object if the file does not exist.
 */
function loadSeenHashes(artifactsDir, keepDays) {
  const filePath = path.join(artifactsDir, SEEN_HASHES_FILENAME);
  let hashes = {};

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    hashes = JSON.parse(raw);
  } catch {
    // File does not exist yet — start fresh
    return {};
  }

  // Purge entries older than keepDays (primary cleanup mechanism)
  const cutoff = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10); // "YYYY-MM-DD"

  let purged = 0;
  for (const [key, date] of Object.entries(hashes)) {
    if (date < cutoff) {
      delete hashes[key];
      purged++;
    }
  }

  if (purged > 0) {
    console.log(`[seen_hashes] Purged ${purged} expired entries (older than ${keepDays} days).`);
  }

  return hashes;
}

/**
 * Persists the seen-hashes map back to disk.
 */
function saveSeenHashes(artifactsDir, hashes) {
  const filePath = path.join(artifactsDir, SEEN_HASHES_FILENAME);
  fs.writeFileSync(filePath, JSON.stringify(hashes, null, 2), "utf8");
}

/**
 * Adds the fingerprints of all items in `finalItems` to the hashes map
 * using today's date as the seen_at value.
 */
function appendToSeenHashes(hashes, finalItems) {
  const today = new Date().toISOString().slice(0, 10);
  for (const item of finalItems) {
    const { titleKey, urlKey } = fingerprintKeys(item);
    if (urlKey) hashes[urlKey] = today;
    hashes[titleKey] = today;
  }
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
 * deduplicates against a persistent cross-execution history,
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

  // ── 4. Load seen-hashes history ───────────────────────────────────────────
  const artifactsDir = path.resolve("artifacts/rss-fetcher");
  const keepDays = 7;

  fs.mkdirSync(artifactsDir, { recursive: true });
  const seenHashes = loadSeenHashes(artifactsDir, keepDays);
  console.log(`[seen_hashes] Loaded ${Object.keys(seenHashes).length} known fingerprints.\n`);

  const collectedItems = [];
  const errors = [];

  // ── 5. Fetch feeds ────────────────────────────────────────────────────────
  for (const feed of feedList) {
    if (collectedItems.length >= maxItems * 2) break;

    try {
      process.stdout.write(`Fetching: ${feed.name} ... `);

      const parsed = await parser.parseURL(feed.url);
      const items = parsed.items || [];

      const relevant = items
        .map((item) => {
          // Strip HTML tags + decode entities before matching
          const title = stripHtml(item.title || "").toLowerCase();
          const body = ""; // reserved for future use

          let score = 0;

          // Positive patterns
          for (const pattern of topicPatterns) {
            score += scorePattern(title, pattern) * 2; // title weight x2
            if (body) score += scorePattern(body, pattern);
          }

          // Negative patterns
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

          // ── Cross-execution deduplication ─────────────────────────────
          const { titleKey, urlKey } = fingerprintKeys({
            title: item.title,
            link: item.link,
          });

          const isDuplicate =
            seenHashes[titleKey] !== undefined ||
            (urlKey && seenHashes[urlKey] !== undefined);

          if (isDuplicate) {
            console.log(`  [skip][dup] score=${score} "${item.title?.slice(0, 80)}"`);
            return null;
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

  // ── 6. Remove intra-execution duplicates ──────────────────────────────────
  const unique = new Map();
  for (const item of collectedItems) {
    const key = item.link || item.title;
    if (!unique.has(key)) unique.set(key, item);
  }

  const finalItems = Array.from(unique.values()).slice(0, maxItems);

  // ── 7. Sort by score, then newest date ───────────────────────────────────
  finalItems.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const da = a.published ? new Date(a.published) : 0;
    const db = b.published ? new Date(b.published) : 0;
    return db - da;
  });

  // ── 8. Build artifact ─────────────────────────────────────────────────────
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

  // ── 9. Print summary ──────────────────────────────────────────────────────
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

  // ── 10. Save artifact ─────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const inputId = (inputs.id || "").trim();
  const artifactName = inputId ? `${inputId}-${today}` : `raw_news-${today}`;
  await saveArtifact(artifactName, artifact);

  console.log(`\nArtifact saved: ${artifactName}.json`);
  console.log("Next step: run the article-writer task consuming this artifact.");

  // ── 11. Update seen-hashes with this execution's items ───────────────────
  appendToSeenHashes(seenHashes, finalItems);
  saveSeenHashes(artifactsDir, seenHashes);
  console.log(`[seen_hashes] Updated with ${finalItems.length} new fingerprint(s).`);

  // ── 12. Cleanup ───────────────────────────────────────────────────────────
  const now = new Date();

  // 12a. Delete old raw_news-YYYY-MM-DD.json files by date in filename
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

  // Removido o mecanismo de deleção física do seen_hashes.json por idade (birthtime).
  // Motivo: a limpeza interna (rolling window) já garante que o arquivo nunca cresce indefinidamente,
  // pois entradas mais velhas que keepDays são removidas ao carregar o histórico.
  // Assim, não há risco de acúmulo ou crescimento descontrolado do arquivo, e o histórico de deduplicação
  // não é perdido abruptamente. A limpeza dos artefatos antigos (raw_news-YYYY-MM-DD.json) permanece ativa.
  //
  // Observação: se o mecanismo removido fosse executado, ele apagaria todo o arquivo de histórico.
  // Isso faria com que, temporariamente, artigos já vistos nos últimos dias voltassem a aparecer como novos
  // (duplicatas), até que o histórico fosse reconstruído nas execuções seguintes.  
  //
  // try {
  //   const seenHashesPath = path.join(artifactsDir, SEEN_HASHES_FILENAME);
  //   if (fs.existsSync(seenHashesPath)) {
  //     const stat = fs.statSync(seenHashesPath);
  //     const ageInDays = (now - stat.birthtime) / (1000 * 60 * 60 * 24);
  //     if (ageInDays > keepDays) {
  //       fs.unlinkSync(seenHashesPath);
  //       console.log(`[cleanup] Deleted ${SEEN_HASHES_FILENAME} (created > ${keepDays} days ago).`);
  //     }
  //   }
  // } catch (err) {
  //   console.warn("[cleanup] Failed to check/delete seen_hashes.json:", err.message);
  // }

}
