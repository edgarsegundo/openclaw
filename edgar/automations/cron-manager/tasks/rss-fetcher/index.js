import Parser from "rss-parser";
// Importação dinâmica do módulo de feeds será feita dentro da função principal
import fs from "fs";
import path from "path";
import he from "he";

// ── HTML utilities ────────────────────────────────────────────────────────────

/**
 * Strips HTML tags and decodes HTML entities from a string.
 */
function stripHtml(str) {
  if (!str) return "";
  return he
    .decode(str)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Metaphone PT-BR ───────────────────────────────────────────────────────────
// Ported 1:1 from metaphone_pt.py (Python → JavaScript)

const METAPHONE_VALID = new Set(["D","R","T","F","J","K","L","X","V","B","N","M"]);

/**
 * Removes diacritics and uppercases — equivalent to Python's
 * unicodedata.normalize('NFD') + filter(category != 'Mn') + upper().
 */
function normalizeAndUpper(word) {
  return word
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

/**
 * Returns the metaphone code for a single PT-BR word.
 * Faithful port of metaphone_ptbr_simple() from metaphone_pt.py.
 */
function metaphonePtBr(word) {
  word = normalizeAndUpper(word);
  const length = word.length;
  const output = [];

  for (let i = 0; i < length; i++) {
    const c    = word[i];
    const next = i + 1 < length ? word[i + 1] : "";
    const prev = i > 0          ? word[i - 1] : "";

    if ("AEIOUYH".includes(c)) {
      continue;
    } else if (c === "C") {
      if (next === "H")            output.push("X");
      else if ("EI".includes(next)) output.push("S");
      else if ("AOU".includes(next)) output.push("K");
    } else if (c === "G") {
      output.push(next === "E" ? "J" : "G");
    } else if (c === "P") {
      output.push(next === "H" ? "F" : "P");
    } else if (c === "Q") {
      output.push(next === "U" ? "K" : "Q");
    } else if (c === "S") {
      if (i > 0 && i + 1 < length && "AEIOU".includes(next) && "AEIOU".includes(prev)) {
        output.push("Z");
      } else if (next === "S") {
        continue; // SS collapses
      } else if (next === "H") {
        output.push("X");
      } else {
        output.push("S");
      }
    } else if (c === "Z") {
      output.push(i === length - 1 ? "S" : "Z");
    } else if (c === "Ç") {
      output.push("S");
    } else if (c === "W") {
      output.push("V");
    } else if (METAPHONE_VALID.has(c)) {
      output.push(c);
    }
    // unknown characters are skipped
  }

  return output.join("");
}

// ── Stop words PT-BR ──────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "a","ao","aos","as","com","da","das","de","do","dos","e","em","é",
  "na","nas","no","nos","o","os","ou","para","pela","pelas","pelo",
  "pelos","por","que","se","um","uma","uns","umas","à","às",
  "mais","mas","já","até","após","sobre","entre","contra","sem",
  "sua","seu","suas","seus","isso","este","esta","esse","essa",
  "esses","estas","estes","essas","foi","são","está","ser",
  "ter","tem","têm","havia","como","quando","onde","quem","qual",
  "quais","novo","nova","novos","novas","grande","grandes",
]);

// ── Title fingerprint pipeline ────────────────────────────────────────────────

/**
 * Removes the trailing source label after the last occurrence of
 * ` - `, ` | `, ` / ` or ` · ` anchored to end-of-string.
 * Example: "EUA endurecem vistos - Exame" → "EUA endurecem vistos"
 */
function removeFonteSuffix(str) {
  return str.replace(/\s+[-|/·]\s+[^-|/·]+$/, "").trim();
}

/**
 * Full pipeline:
 *   removeFonteSuffix → normalize → tokenize → remove stop words
 *   → metaphone → sort → join("-")
 *
 * Returns a stable, human-readable fingerprint string.
 * Example: "eua endurecem vistos america latina" → "AMRK-LTNK-NTR-ST-VS"
 */
function titleFingerprint(title) {
  const clean = removeFonteSuffix(
    title.toLowerCase().trim().replace(/\s+/g, " ")
  );

  const tokens = clean
    .split(/\s+/)
    .map(w => w.replace(/[^a-záàãâéêíóôõúüçñ]/gi, ""))
    .filter(w => w.length > 1 && !STOP_WORDS.has(w))
    .map(metaphonePtBr)
    .filter(Boolean);

  return tokens.sort().join("-");
}

/**
 * Jaccard similarity between two fingerprint strings (token sets).
 */
function jaccardSimilarity(fpA, fpB) {
  if (!fpA || !fpB) return 0;
  const setA = new Set(fpA.split("-"));
  const setB = new Set(fpB.split("-"));
  const intersection = [...setA].filter(t => setB.has(t)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

/** Items are considered duplicates when Jaccard similarity >= this value. */
const JACCARD_THRESHOLD = 0.7;

// ── Seen-hashes persistence ───────────────────────────────────────────────────

// seen_hashes.json agora é específico por inputId (ou padrão)
function getSeenHashesFilename(inputId) {
  return inputId ? `seen_hashes-${inputId}.json` : "seen_hashes.json";
}

/**
 * Loads the seen-fingerprints map from disk, purges entries older than keepDays.
 * Keys: title fingerprints (metaphone tokens joined by "-").
 * Values: "YYYY-MM-DD" of first sighting.
 */
function loadSeenHashes(artifactsDir, keepDays, inputId) {
  const filePath = path.join(artifactsDir, getSeenHashesFilename(inputId));
  let hashes = {};

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    hashes = JSON.parse(raw);
  } catch {
    return {};
  }

  const cutoff = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  let purged = 0;
  for (const [key, date] of Object.entries(hashes)) {
    if (date < cutoff) { delete hashes[key]; purged++; }
  }

  if (purged > 0) {
    console.log(`[seen_hashes] Purged ${purged} expired entries (older than ${keepDays} days).`);
  }

  return hashes;
}

function saveSeenHashes(artifactsDir, hashes, inputId) {
  const filePath = path.join(artifactsDir, getSeenHashesFilename(inputId));
  fs.writeFileSync(filePath, JSON.stringify(hashes, null, 2), "utf8");
}

/**
 * Checks whether a fingerprint matches any entry in seenHashes.
 * Returns the matched key if duplicate, null otherwise.
 * Strategy: exact match O(1) first, then Jaccard O(n) fallback.
 */
function findDuplicateInHistory(fp, seenHashes) {
  if (seenHashes[fp] !== undefined) return fp;
  for (const key of Object.keys(seenHashes)) {
    if (jaccardSimilarity(fp, key) >= JACCARD_THRESHOLD) return key;
  }
  return null;
}

/**
 * Appends fingerprints of all finalItems to the hashes map with today's date.
 */
function appendToSeenHashes(hashes, finalItems) {
  const today = new Date().toISOString().slice(0, 10);
  for (const item of finalItems) {
    const fp = titleFingerprint(item.title);
    if (fp) hashes[fp] = today;
  }
}

// ── Scoring utilities ─────────────────────────────────────────────────────────

function matchesAllWords(text, pattern) {
  const words = pattern.split(/\s+/).filter(Boolean);
  return words.every((word) => new RegExp(word, "i").test(text));
}

function proximityBonus(text, pattern, windowSize = 8) {
  const patternWords = pattern.split(/\s+/).filter(Boolean);
  if (patternWords.length < 2) return 0;
  const textWords = text.split(/\s+/);
  for (let i = 0; i < textWords.length; i++) {
    const window = textWords.slice(i, i + windowSize).join(" ");
    if (patternWords.every((w) => new RegExp(w, "i").test(window))) return 1;
  }
  return 0;
}

function scorePattern(text, pattern) {
  if (!text || !pattern) return 0;
  const exactRegex = new RegExp(
    pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    "i"
  );
  let score = 0;
  if (exactRegex.test(text)) {
    score += 2;
  } else if (matchesAllWords(text, pattern)) {
    score += 2;
    score += proximityBonus(text, pattern);
  }
  return score;
}

/**
 * export default async function (context) — rss-fetcher task
 *
 * Fetches news from RSS feeds, filters by topic relevance,
 * deduplicates against a persistent cross-execution history,
 * and saves a raw_news.json artifact for downstream tasks.
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
  const feedJsFile = (inputs.feeds_js_file || "").trim() || "feeds.js";

  // Importação dinâmica do módulo de feeds
  let DEFAULT_FEEDS, parseCustomFeeds;
  try {
    // Caminho relativo ao arquivo atual
    const feedsModule = await import(`./${feedJsFile}`);
    DEFAULT_FEEDS = feedsModule.DEFAULT_FEEDS;
    parseCustomFeeds = feedsModule.parseCustomFeeds;
  } catch (err) {
    throw new Error(`Não foi possível importar o módulo de feeds '${feedJsFile}': ${err.message}`);
  }

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
    console.log(`Using ${feedList.length} default feed(s) for ${categoryLabel}language '${language}'.`);
  }

  // ── 2. Compute date cutoff ────────────────────────────────────────────────
  const sinceCutoff =
    sinceHours > 0 ? new Date(Date.now() - sinceHours * 60 * 60 * 1000) : null;

  if (sinceCutoff) {
    console.log(`Only including items published after: ${sinceCutoff.toISOString()} (last ${sinceHours}h)`);
  }

  // ── 3. RSS parser ─────────────────────────────────────────────────────────
  const parser = new Parser({
    timeout: 10000,
    headers: { "User-Agent": "rss-fetcher-bot/1.0" },
    requestOptions: { agent: false },
  });

  console.log(`\nSearching for topic: "${inputs.topic}"`);
  console.log(`Patterns: ${topicPatterns.join(", ")}`);
  if (excludePatterns.length > 0) console.log(`Exclude patterns: ${excludePatterns.join(", ")}`);
  console.log(`Max items to collect: ${maxItems}\n`);

  // ── 4. Load seen-hashes history ───────────────────────────────────────────
  const artifactsDir = path.resolve("artifacts/rss-fetcher");
  const keepDays = 7;

  fs.mkdirSync(artifactsDir, { recursive: true });
  const seenHashes = loadSeenHashes(artifactsDir, keepDays, inputId);
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
          const title = stripHtml(item.title || "").toLowerCase();
          const body = ""; // reserved for future use

          let score = 0;

          for (const pattern of topicPatterns) {
            score += scorePattern(title, pattern) * 2;
            if (body) score += scorePattern(body, pattern);
          }

          for (const pattern of excludePatterns) {
            const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const regex = new RegExp(escaped, "i");
            if (regex.test(title)) score -= 2;
            if (body && regex.test(body)) score -= 1;
          }

          if (score < 2) {
            console.log(`  [skip] score=${score} "${item.title?.slice(0, 80)}"`);
            return null;
          }

          if (sinceCutoff) {
            const pubDate = item.isoDate || item.pubDate;
            if (!pubDate) return null;
            const parsedDate = new Date(pubDate);
            if (isNaN(parsedDate.getTime())) return null;
            if (parsedDate < sinceCutoff) return null;
          }

          // ── Cross-execution deduplication ──────────────────────────────
          const fp = titleFingerprint(title);
          const matchedKey = findDuplicateInHistory(fp, seenHashes);

          if (matchedKey) {
            const isExact = matchedKey === fp;
            const simLabel = isExact ? "exact" : `jaccard=${jaccardSimilarity(fp, matchedKey).toFixed(2)}`;
            console.log(`  [skip][dup:${simLabel}] score=${score} "${item.title?.slice(0, 80)}"`);
            return null;
          }

          return { item, score, cleanTitle: title, fp };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score);

      console.log(`${items.length} items found, ${relevant.length} relevant.`);

      for (const { item, score, cleanTitle, fp } of relevant) {
        if (collectedItems.length >= maxItems * 2) break;

        collectedItems.push({
          title: cleanTitle || stripHtml(item.title || ""),
          link: item.link || "",
          published: item.isoDate || item.pubDate || null,
          summary: stripHtml(item.contentSnippet || item.summary || ""),
          source: feed.name,
          source_url: feed.url,
          language: feed.lang,
          category: feed.category,
          score,
          _fp: fp, // internal — removed before saving
          fetched_at_item: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.log(`ERROR — ${err.message}`);
      errors.push({ feed: feed.name, url: feed.url, error: err.message });
    }
  }

  // ── 6. Remove intra-execution duplicates (title fingerprint + Jaccard) ────
  const uniqueItems = [];
  const seenFps = [];

  for (const item of collectedItems) {
    const isDup = seenFps.some(existingFp =>
      existingFp === item._fp ||
      jaccardSimilarity(item._fp, existingFp) >= JACCARD_THRESHOLD
    );

    if (!isDup) {
      seenFps.push(item._fp);
      uniqueItems.push(item);
    }
  }

  // Strip internal _fp field and apply max_items cap
  const finalItems = uniqueItems
    .slice(0, maxItems)
    .map(({ _fp, ...rest }) => rest);

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
    console.warn("No items found for this topic. Try broader patterns, fewer exclusions, a larger since_hours window, or more feeds.");
  } else {
    for (const item of finalItems) {
      const date = item.published
        ? new Date(item.published).toLocaleDateString("pt-BR")
        : "no date";
      console.log(`• [${date}] score=${item.score} ${item.title}`);
      console.log(`  ${item.source} — ${item.link}`);
    }
  }

  // ── 10. Save artifact (only if there are new items) ───────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const inputId = (inputs.id || "").trim();
  const artifactName = inputId ? `${inputId}-${today}` : `raw_news-${today}`;

  if (finalItems.length > 0) {
    await saveArtifact(artifactName, artifact);
    console.log(`\nArtifact saved: ${artifactName}.json`);
    console.log("Next step: run the article-writer task consuming this artifact.");
  } else {
    console.log(`\nNo new items — artifact not overwritten (${artifactName}.json preserved).`);
  }

  // ── 11. Update seen-hashes with this execution's items ───────────────────
  appendToSeenHashes(seenHashes, finalItems);
  saveSeenHashes(artifactsDir, seenHashes, inputId);
  console.log(`[seen_hashes] Updated with ${finalItems.length} new fingerprint(s).`);

  // ── 12. Cleanup ───────────────────────────────────────────────────────────
  const now = new Date();

  // 12a. Delete old dated artifact files by date in filename
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

  // 12b. Delete seen_hashes.json if birthtime > keepDays
  // (secondary mechanism — primary is entry-level purge in loadSeenHashes)
  try {
    const seenHashesPath = path.join(artifactsDir, getSeenHashesFilename(inputId));
    if (fs.existsSync(seenHashesPath)) {
      const stat = fs.statSync(seenHashesPath);
      const ageInDays = (now - stat.birthtime) / (1000 * 60 * 60 * 24);
      if (ageInDays > keepDays) {
        fs.unlinkSync(seenHashesPath);
        console.log(`[cleanup] Deleted ${SEEN_HASHES_FILENAME} (created > ${keepDays} days ago).`);
      }
    }
  } catch (err) {
    console.warn("[cleanup] Failed to check/delete seen_hashes.json:", err.message);
  }
}
