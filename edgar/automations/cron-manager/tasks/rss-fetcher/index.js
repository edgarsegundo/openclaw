import Parser from "rss-parser";
import * as cheerio from "cheerio";
import fs from "fs";
import path from "path";
import he from "he";
import { initMonitoring } from "../../lib/monitoring.js";
import { itemIdFromUrl } from "../../lib/url.js";
import { writeFileAtomicSync } from "../../lib/atomic.js";

initMonitoring();

// ── XML sanitization ──────────────────────────────────────────────────────────

/**
 * Sanitize malformed RSS/XML so the parser doesn't choke on common HTML-isms.
 *
 * Fixes handled:
 *  1. Bare & not part of a valid entity reference → &amp;
 *     (e.g. "AT&T", "price=10&20")
 *  2. HTML boolean attributes without a value → attr=""
 *     (e.g. <img loading> <input disabled checked> — valid HTML5, invalid XML)
 *
 * The boolean-attribute fixer processes only XML start tags (<tagname ...>),
 * skipping comments (<!--), CDATA (<![), closing tags (</) and quoted values
 * inside tags so it never corrupts attribute values.
 */
function sanitizeXml(str) {
  // 1. Fix bare &
  str = str.replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]*|#[0-9]+|#x[0-9a-fA-F]+);)/g, "&amp;");

  // 2. Fix < used as a comparison operator: <word; or < word; patterns are never valid XML tag
  //    names (nameStart chars followed by nameBody chars ending in ; before whitespace/>).
  //    Covers ASCII and Unicode nameStart chars (_/:) missed by the old [a-zA-Z] guard.
  //    Replaces the bare < with &lt; so the text is preserved correctly.
  //    Note: stripping <script>/<style> blocks was tried but corrupts feeds when those tags
  //    span CDATA boundaries — this targeted replacement is sufficient.
  str = str.replace(/<(\s*)([^\s<>/!?"'=][^<>;"'\s]*);/g, "&lt;$1$2;");

  // 3. Fix boolean attributes — only in opening start tags (< followed by a letter)
  str = str.replace(/<[a-zA-Z][^<>]*>/g, (tag) => {
    const out = [];
    let i = 0;
    while (i < tag.length) {
      const ch = tag[i];
      // Copy quoted attribute values verbatim
      if (ch === '"' || ch === "'") {
        const end = tag.indexOf(ch, i + 1);
        if (end < 0) {
          out.push(tag.slice(i));
          break;
        }
        out.push(tag.slice(i, end + 1));
        i = end + 1;
        continue;
      }
      // Detect whitespace + attribute-name NOT followed by =
      const m = /^(\s+)([a-zA-Z][a-zA-Z0-9:-]*)/.exec(tag.slice(i));
      if (m && tag[i + m[0].length] !== "=") {
        out.push(m[1], m[2], '=""');
        i += m[0].length;
        continue;
      }
      out.push(ch);
      i++;
    }
    return out.join("");
  });

  return str;
}

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

const METAPHONE_VALID = new Set(["D", "R", "T", "F", "J", "K", "L", "X", "V", "B", "N", "M"]);

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
    const c = word[i];
    const next = i + 1 < length ? word[i + 1] : "";
    const prev = i > 0 ? word[i - 1] : "";

    if ("AEIOUYH".includes(c)) {
      continue;
    } else if (c === "C") {
      if (next === "H") output.push("X");
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
  "a",
  "ao",
  "aos",
  "as",
  "com",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "em",
  "é",
  "na",
  "nas",
  "no",
  "nos",
  "o",
  "os",
  "ou",
  "para",
  "pela",
  "pelas",
  "pelo",
  "pelos",
  "por",
  "que",
  "se",
  "um",
  "uma",
  "uns",
  "umas",
  "à",
  "às",
  "mais",
  "mas",
  "já",
  "até",
  "após",
  "sobre",
  "entre",
  "contra",
  "sem",
  "sua",
  "seu",
  "suas",
  "seus",
  "isso",
  "este",
  "esta",
  "esse",
  "essa",
  "esses",
  "estas",
  "estes",
  "essas",
  "foi",
  "são",
  "está",
  "ser",
  "ter",
  "tem",
  "têm",
  "havia",
  "como",
  "quando",
  "onde",
  "quem",
  "qual",
  "quais",
  "novo",
  "nova",
  "novos",
  "novas",
  "grande",
  "grandes",
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
 */
function titleFingerprint(title) {
  const clean = removeFonteSuffix(title.toLowerCase().trim().replace(/\s+/g, " "));

  const tokens = clean
    .split(/\s+/)
    .map((w) => w.replace(/[^a-záàãâéêíóôõúüçñ]/gi, ""))
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w))
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
  const intersection = [...setA].filter((t) => setB.has(t)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

/** Items are considered duplicates when Jaccard similarity >= this value. */
const JACCARD_THRESHOLD = 0.7;

// ── Seen-hashes persistence ───────────────────────────────────────────────────

function getSeenHashesFilename(group) {
  return group ? `seen_hashes-${group}.json` : "seen_hashes.json";
}

/**
 * Loads the seen-fingerprints map from disk, purges entries older than keepDays.
 */
function loadSeenHashes(artifactsDir, keepDays, group) {
  const filePath = path.join(artifactsDir, getSeenHashesFilename(group));
  let hashes = {};

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    hashes = JSON.parse(raw);
  } catch {
    return {};
  }

  const cutoff = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

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

function saveSeenHashes(artifactsDir, hashes, group) {
  const filePath = path.join(artifactsDir, getSeenHashesFilename(group));
  writeFileAtomicSync(filePath, JSON.stringify(hashes, null, 2));
}

/**
 * Checks whether a fingerprint matches any entry in seenHashes.
 * Returns the matched key if duplicate, null otherwise.
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
  const exactRegex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  let score = 0;
  if (exactRegex.test(text)) {
    score += 2;
  } else if (matchesAllWords(text, pattern)) {
    score += 2;
    score += proximityBonus(text, pattern);
  }
  return score;
}

// ── Scraper ───────────────────────────────────────────────────────────────────

const SCRAPER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * Returns a random delay in ms between minMs and maxMs.
 */
function randomDelay(minMs = 1500, maxMs = 4000) {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

/**
 * Sleeps for ms milliseconds.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Checks robots.txt for the given URL.
 * Returns true if scraping is allowed, false if blocked.
 * On any fetch error, defaults to allowed (fail-open).
 */
async function isAllowedByRobots(url) {
  try {
    const { origin, pathname } = new URL(url);
    const robotsUrl = `${origin}/robots.txt`;
    const res = await fetch(robotsUrl, {
      headers: { "User-Agent": SCRAPER_USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return true; // no robots.txt → allow

    const text = await res.text();
    const lines = text.split("\n").map((l) => l.trim());

    let applicable = false;
    for (const line of lines) {
      if (/^user-agent:\s*\*/i.test(line)) {
        applicable = true;
        continue;
      }
      if (/^user-agent:/i.test(line)) {
        applicable = false;
        continue;
      }
      if (applicable && /^disallow:/i.test(line)) {
        const disallowed = line.replace(/^disallow:\s*/i, "").trim();
        if (disallowed && pathname.startsWith(disallowed)) return false;
      }
    }
    return true;
  } catch {
    return true; // fail-open
  }
}

/**
 * Humanizes a URL slug into a readable title.
 * Example: "/pato-donald-descubra-de-quem" → "Pato Donald Descubra De Quem"
 */
function slugToTitle(href) {
  try {
    const { pathname } = new URL(href, "https://example.com");
    const segments = pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1] || "";
    // strip file extension and date-like segments
    const cleaned = last
      .replace(/\.(html?|ghtml|php|aspx)$/i, "")
      .replace(/^\d{4}-\d{2}-\d{2}$/, "")
      .replace(/[-_]/g, " ")
      .trim();
    if (cleaned.length < 10) return "";
    return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    return "";
  }
}

/**
 * Heuristic: decides if a candidate <a> looks like a news article link.
 * Returns true if at least 2 of 4 criteria are met.
 */
function looksLikeArticle($, el, href) {
  let score = 0;

  // 1. Text length between 20 and 200 chars
  const text = $(el).text().trim();
  if (text.length >= 20 && text.length <= 200) score++;

  // 2. URL pattern suggests an article (date, long slug, known extensions)
  if (
    /\/\d{4}\/\d{2}\//.test(href) ||
    /\.(html?|ghtml)$/i.test(href) ||
    href.split("/").filter(Boolean).length >= 3
  )
    score++;

  // 3. Inside a semantic container
  const semanticParents = ["article", "main", "section"];
  const semanticClasses = /feed|card|post|news|noticia|story|item/i;
  const parents = $(el).parents().toArray();
  const inSemantic = parents.some((p) => {
    const tag = (p.tagName || "").toLowerCase();
    const cls = $(p).attr("class") || "";
    return semanticParents.includes(tag) || semanticClasses.test(cls);
  });
  if (inSemantic) score++;

  // 4. URL is not navigation/utility
  const isNav =
    /\/(tag|autor|categoria|author|category|search|busca|login|register|#|mailto:|javascript:)/i.test(
      href,
    );
  if (!isNav) score++;

  return score >= 2;
}

/**
 * Fetches and parses a scraper feed.
 * Returns an array of { title, link } objects (raw, before pipeline scoring).
 *
 * @param {object} feed - Feed object with optional scrap_layout_tips
 */
async function fetchFromScraper(feed) {
  const tips = feed.scrap_layout_tips || {};
  const { link_selector, title_selector } = tips;
  const mode = link_selector ? "preciso" : "heurístico";

  console.log(
    `[scraper] Fetching: ${feed.name} (modo: ${mode}${link_selector ? `, selector: ${link_selector}` : ""})`,
  );

  // ── robots.txt check ──────────────────────────────────────────────────────
  const allowed = await isAllowedByRobots(feed.url);
  if (!allowed) {
    console.warn(`[scraper][robots] SKIP ${feed.url} — bloqueado por robots.txt`);
    return [];
  }

  // ── fetch HTML ────────────────────────────────────────────────────────────
  const res = await fetch(feed.url, {
    headers: { "User-Agent": SCRAPER_USER_AGENT },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ao buscar ${feed.url}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  const origin = new URL(feed.url).origin;

  const candidates = [];

  if (link_selector) {
    // ── Modo preciso: usa o seletor fornecido ──────────────────────────────
    $(link_selector).each((_, el) => {
      const rawHref = $(el).attr("href") || "";
      if (!rawHref) return;

      // Normalize to absolute URL
      let href;
      try {
        href = new URL(rawHref, feed.url).href;
      } catch {
        return;
      }

      // Discard external links
      if (!href.startsWith(origin)) return;

      // Extract title: title_selector in parent container, or textContent of <a>
      let title = "";
      if (title_selector) {
        const container = $(el).closest("*").find(title_selector).first();
        title = container.text().trim();
      }
      if (!title) {
        title = $(el).text().trim();
      }

      // Fallback to slug humanization
      if (!title || title.length < 10) {
        title = slugToTitle(href);
      }

      if (title && title.length >= 10) {
        candidates.push({ title, link: href });
      }
    });
  } else {
    // ── Modo heurístico: percorre todos os <a> ─────────────────────────────
    $("a[href]").each((_, el) => {
      const rawHref = $(el).attr("href") || "";
      if (!rawHref) return;

      let href;
      try {
        href = new URL(rawHref, feed.url).href;
      } catch {
        return;
      }

      if (!href.startsWith(origin)) return;
      if (!looksLikeArticle($, el, href)) return;

      let title = $(el).text().trim();
      if (!title || title.length < 10) {
        title = slugToTitle(href);
      }

      if (title && title.length >= 10) {
        candidates.push({ title, link: href });
      }
    });
  }

  // Deduplicate by link within this page
  const seen = new Set();
  const unique = candidates.filter(({ link }) => {
    if (seen.has(link)) return false;
    seen.add(link);
    return true;
  });

  console.log(
    `[scraper] ${candidates.length} candidatos encontrados, ${unique.length} únicos com título válido.`,
  );

  if (unique.length === 0) {
    console.warn(
      `[scraper][warn] Feed "${feed.name}" retornou 0 itens — verifique o layout ou o link_selector.`,
    );
  }

  return unique;
}

// ── Shared item scoring & filtering ──────────────────────────────────────────

/**
 * Scores and filters a list of raw items (both RSS and scraper).
 * Returns array of { title, link, published, score, fp, ... } or null entries filtered out.
 *
 * @param {Array}  rawItems     - Array of { title, link, published, summary? }
 * @param {object} feed         - Feed metadata
 * @param {Array}  topicPatterns
 * @param {Array}  excludePatterns
 * @param {Date|null} sinceCutoff
 * @param {object} seenHashes
 */
function scoreAndFilterItems(
  rawItems,
  feed,
  topicPatterns,
  excludePatterns,
  sinceCutoff,
  seenHashes,
  aiMode = false,
) {
  return rawItems
    .map((raw) => {
      const title = stripHtml(raw.title || "").toLowerCase();

      // In AI mode: drop titles that are clearly too short/long to be real articles
      if (aiMode) {
        const len = title.length;
        if (len < 15 || len > 300) return null;
      }

      let score = 0;
      for (const pattern of topicPatterns) {
        score += scorePattern(title, pattern) * 2;
      }
      for (const pattern of excludePatterns) {
        const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(escaped, "i");
        if (regex.test(title)) score -= 2;
      }

      // In AI mode: threshold relaxed — only hard-exclude items, semantic filter comes later.
      // pass_through feeds include all items not explicitly excluded.
      const minScore = aiMode || feed.pass_through ? 0 : 2;
      if (score < minScore) {
        console.log(`  [skip] score=${score} "${(raw.title || "").slice(0, 80)}"`);
        return null;
      }

      if (sinceCutoff && raw.published) {
        const parsedDate = new Date(raw.published);
        if (!isNaN(parsedDate.getTime()) && parsedDate < sinceCutoff) return null;
      }

      // Cross-execution deduplication
      const fp = titleFingerprint(title);
      const matchedKey = findDuplicateInHistory(fp, seenHashes);
      if (matchedKey) {
        const isExact = matchedKey === fp;
        const simLabel = isExact
          ? "exact"
          : `jaccard=${jaccardSimilarity(fp, matchedKey).toFixed(2)}`;
        console.log(`  [skip][dup:${simLabel}] score=${score} "${(raw.title || "").slice(0, 80)}"`);
        return null;
      }

      return {
        title,
        link: raw.link || "",
        published: raw.published || null,
        ...(raw.summary ? { summary: raw.summary } : {}),
        source: feed.name,
        source_url: feed.url,
        language: feed.lang,
        category: feed.category,
        score,
        _fp: fp,
        fetched_at_item: new Date().toISOString(),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
}

/**
 * Send a list of article titles to GPT-4o mini for semantic filtering.
 * Returns { items: Item[], usage: {prompt_tokens,completion_tokens}, error?: string }.
 * Fail-open: on any error returns all items unchanged so the pipeline continues.
 */
async function aiFilterItems(items, systemPrompt, apiKey) {
  if (!items.length) return { items, usage: { prompt_tokens: 0, completion_tokens: 0 } };

  const userMessage = items.map((it, i) => `${i}. ${it.title}`).join("\n");

  let raw;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              systemPrompt +
              "\n\nReturn ONLY a valid JSON array of 0-based indices of matching articles. Example: [0,3,7]. If none match, return []. No explanation.",
          },
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return {
        items,
        usage: { prompt_tokens: 0, completion_tokens: 0 },
        error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
      };
    }

    raw = await res.json();
  } catch (err) {
    return { items, usage: { prompt_tokens: 0, completion_tokens: 0 }, error: err.message };
  }

  const usage = raw.usage ?? { prompt_tokens: 0, completion_tokens: 0 };
  const content = raw.choices?.[0]?.message?.content ?? "[]";

  let indices;
  try {
    // Extract JSON array even if the model wrapped it in markdown fences
    const match = content.match(/\[[\s\S]*\]/);
    indices = JSON.parse(match ? match[0] : content);
    if (!Array.isArray(indices)) throw new Error("not an array");
  } catch {
    // If parsing fails, return all items (fail-open)
    return { items, usage, error: `bad_response: ${content.slice(0, 100)}` };
  }

  const approved = items.filter((_, i) => indices.includes(i));
  return { items: approved, usage };
}

// ── Main task ─────────────────────────────────────────────────────────────────

/**
 * export default async function (context) — rss-fetcher task
 *
 * Fetches news from RSS feeds and/or scraper feeds, filters by topic relevance,
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
 *   category         - filter default feeds by category (default: all)
 */
export default async function (context) {
  const { taskName, mode, executionId, inputs, saveArtifact, track, flow } = context;

  console.log(`Task: ${taskName} | Mode: ${mode} | ID: ${executionId}`);

  const topic = (inputs.topic || "").trim().toLowerCase();
  const maxItems = Number(inputs.max_items) || 10;
  const language = (inputs.language || "pt").trim().toLowerCase();
  const customFeedsRaw = (inputs.feeds || "").trim();
  const sinceHours = Number(inputs.since_hours) || 0;
  const category = (inputs.category || "").trim().toLowerCase();
  const feedJsFile = (inputs.feeds_js_file || "").trim() || "feeds.js";

  const group = (inputs.group || "").trim();
  if (!group) {
    console.error(
      "❌ Parâmetro 'group' obrigatório. Defina no arquivo dentro do diretório 'inputs'",
    );
    return;
  }

  const aiFilterPrompt = (inputs.ai_filter_prompt || "").trim();
  const maxPerFeed = Number(inputs.max_per_feed) || 0; // 0 = no cap

  // Dynamic import of feeds module
  let DEFAULT_FEEDS, parseCustomFeeds;
  try {
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
        ? topic
            .split(";")
            .map((p) => p.trim().toLowerCase())
            .filter(Boolean)
        : [];

  if (topicPatterns.length === 0) {
    throw new Error("You must provide topic or patterns.");
  }

  const excludePatterns = (inputs.exclude_patterns || "")
    .split(";")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);

  // ── 1. Resolve feed list ──────────────────────────────────────────────────
  let feedList;

  if (customFeedsRaw) {
    feedList = parseCustomFeeds(customFeedsRaw);
    console.log(`Using ${feedList.length} custom feed(s) provided via input.`);
  } else {
    feedList = DEFAULT_FEEDS.filter((f) => {
      const langMatch = language === "all" || f.lang === language || f.lang === "unknown";
      const categoryMatch = category ? f.category === category : true;
      return langMatch && categoryMatch;
    });
    const categoryLabel = category ? `category '${category}', ` : "";
    console.log(
      `Using ${feedList.length} default feed(s) for ${categoryLabel}language '${language}'.`,
    );
  }

  flow?.("resolve_feeds", "ok", {
    feeds: feedList.length,
    source: customFeedsRaw ? "custom" : "default",
    language,
    category: category || "all",
    max_items: maxItems,
  });

  // ── 2. Compute date cutoff ────────────────────────────────────────────────
  const sinceCutoff = sinceHours > 0 ? new Date(Date.now() - sinceHours * 60 * 60 * 1000) : null;

  if (sinceCutoff) {
    console.log(
      `Only including items published after: ${sinceCutoff.toISOString()} (last ${sinceHours}h)`,
    );
  }

  // ── 3. RSS parser instance ────────────────────────────────────────────────
  const rssParser = new Parser({
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
  const seenHashes = loadSeenHashes(artifactsDir, keepDays, group);
  console.log(`[seen_hashes] Loaded ${Object.keys(seenHashes).length} known fingerprints.\n`);

  const collectedItems = [];
  const errors = [];
  const badFeeds = [];

  // ── 5. Fetch all feeds (RSS + scraper) ────────────────────────────────────
  const todayIso = new Date().toISOString();

  for (const feed of feedList) {
    if (collectedItems.length >= maxItems * 2) break;

    const feedType = feed.type || "rss";

    try {
      if (feedType === "scraper") {
        // ── Scraper path ───────────────────────────────────────────────────
        const rawItems = await fetchFromScraper(feed);

        // Map to common shape: published defaults to today
        const shaped = rawItems.map((r) => ({
          title: r.title,
          link: r.link,
          published: todayIso,
        }));

        const relevant = scoreAndFilterItems(
          shaped,
          feed,
          topicPatterns,
          excludePatterns,
          sinceCutoff,
          seenHashes,
          !!aiFilterPrompt,
        );

        const capped = maxPerFeed > 0 ? relevant.slice(0, maxPerFeed) : relevant;
        console.log(`${rawItems.length} itens extraídos, ${capped.length} relevantes.`);

        for (const item of capped) {
          if (collectedItems.length >= maxItems * 2) break;
          collectedItems.push(item);
        }

        // Random delay after each scraper request to avoid rate limiting
        const delay = randomDelay();
        console.log(`[scraper] Aguardando ${delay}ms antes do próximo feed...`);
        await sleep(delay);
      } else {
        // ── RSS path ───────────────────────────────────────────────────────
        process.stdout.write(`Fetching: ${feed.name} ... `);

        // Fetch raw XML manually so we can sanitize bare & before parsing.
        // Some feeds ship malformed XML (e.g. "AT&T" instead of "AT&amp;T")
        // that would otherwise throw "Invalid character in entity name".
        const feedRes = await fetch(feed.url, {
          headers: { "User-Agent": "rss-fetcher-bot/1.0" },
          signal: AbortSignal.timeout(10000),
        });
        const rawXml = await feedRes.text();
        const parsed = await rssParser.parseString(sanitizeXml(rawXml));
        const items = parsed.items || [];

        // Map rss-parser items to common shape
        const shaped = items.map((item) => ({
          title: item.title || "",
          link: item.link || "",
          published: item.isoDate || item.pubDate || null,
          summary: item.contentSnippet || item.summary || "",
        }));

        const relevant = scoreAndFilterItems(
          shaped,
          feed,
          topicPatterns,
          excludePatterns,
          sinceCutoff,
          seenHashes,
          !!aiFilterPrompt,
        );

        const capped = maxPerFeed > 0 ? relevant.slice(0, maxPerFeed) : relevant;
        console.log(`${items.length} items found, ${capped.length} relevant.`);

        for (const item of capped) {
          if (collectedItems.length >= maxItems * 2) break;
          collectedItems.push(item);
        }
      }
    } catch (err) {
      const isInvalidFeed =
        /feed not recognized/i.test(err.message) ||
        /non-whitespace before first tag/i.test(err.message) ||
        /unexpected close tag/i.test(err.message) ||
        /unexpected end/i.test(err.message) ||
        /invalid character in entity/i.test(err.message);

      if (isInvalidFeed) {
        console.log(`[bad_feed] "${feed.name}" — not a valid RSS feed`);
        badFeeds.push({ feed: feed.name, url: feed.url, error: err.message });
        track?.({
          group,
          step: "bad_feed",
          status: "failed",
          reason: "invalid_rss",
          meta: {
            feed: feed.name,
            url: feed.url,
            feeds_js_path: `tasks/rss-fetcher/${feedJsFile}`,
          },
        });
      } else {
        console.log(`ERROR — ${err.message}`);
        errors.push({ feed: feed.name, url: feed.url, error: err.message });
        track?.({
          group,
          step: "fetch",
          status: "failed",
          reason: "feed_error",
          error: err,
          meta: { feed: feed.name, url: feed.url },
        });
      }
    }
  }

  if (badFeeds.length > 0) {
    console.log(`\n[bad_feeds] ${badFeeds.length} feed(s) não retornaram RSS válido:`);
    for (const bf of badFeeds) console.log(`  • ${bf.feed} — ${bf.url}`);
  }

  flow?.("fetch_feeds", "ok", {
    feeds_attempted: feedList.length,
    feeds_failed: errors.length,
    feeds_bad: badFeeds.length,
    collected: collectedItems.length,
  });

  // ── 6. Remove intra-execution duplicates (title fingerprint + Jaccard) ────
  const uniqueItems = [];
  const seenFps = [];

  for (const item of collectedItems) {
    const isDup = seenFps.some(
      (existingFp) =>
        existingFp === item._fp || jaccardSimilarity(item._fp, existingFp) >= JACCARD_THRESHOLD,
    );

    if (!isDup) {
      seenFps.push(item._fp);
      uniqueItems.push(item);
    }
  }

  flow?.("dedup", "ok", {
    before: collectedItems.length,
    after: uniqueItems.length,
    removed: collectedItems.length - uniqueItems.length,
  });

  // Strip internal _fp field and apply max_items cap
  const finalItems = uniqueItems.slice(0, maxItems).map(({ _fp, ...rest }) => rest);

  // ── 7. Sort by score, then newest date ───────────────────────────────────
  finalItems.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const da = a.published ? new Date(a.published) : 0;
    const db = b.published ? new Date(b.published) : 0;
    return db - da;
  });

  flow?.("rank_select", "ok", {
    selected: finalItems.length,
    max_items: maxItems,
    top_score: finalItems[0]?.score ?? null,
  });

  // ── 7b. AI semantic filter (optional) ────────────────────────────────────
  let publishItems = finalItems;
  if (aiFilterPrompt && finalItems.length > 0) {
    const apiKey = process.env.OPENAI_API_KEY || "";
    if (!apiKey) {
      console.warn("[ai_filter] OPENAI_API_KEY not set — skipping AI filter (fail-open)");
      flow?.("ai_filter", "skipped", { reason: "no_api_key", input: finalItems.length });
    } else {
      console.log(`\n[ai_filter] Sending ${finalItems.length} titles to GPT-4o mini...`);
      const result = await aiFilterItems(finalItems, aiFilterPrompt, apiKey);

      const promptTokens = result.usage.prompt_tokens;
      const completionTokens = result.usage.completion_tokens;
      // GPT-4o mini pricing: $0.15/1M input, $0.60/1M output
      const costUsd = (promptTokens * 0.15 + completionTokens * 0.6) / 1_000_000;

      if (result.error) {
        console.warn(`[ai_filter] Error (fail-open): ${result.error}`);
        flow?.("ai_filter", "skipped", {
          reason: "api_error",
          error: result.error,
          input: finalItems.length,
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          cost_usd: costUsd,
        });
      } else {
        publishItems = result.items;
        console.log(
          `[ai_filter] ${finalItems.length} → ${publishItems.length} approved (cost: $${costUsd.toFixed(6)})`,
        );
        flow?.("ai_filter", "ok", {
          input: finalItems.length,
          approved: publishItems.length,
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          cost_usd: costUsd,
        });
      }
    }
  }

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
    total_feeds_bad: badFeeds.length,
    total_items_collected: publishItems.length,
    items: publishItems,
    errors: errors.length > 0 ? errors : undefined,
    bad_feeds: badFeeds.length > 0 ? badFeeds : undefined,
  };

  // ── 9. Print summary ──────────────────────────────────────────────────────
  console.log("\n─── Summary ─────────────────────────────────────────────");
  console.log(`Topic:          ${artifact.topic}`);
  console.log(`Language:       ${artifact.language}`);
  console.log(`Category:       ${artifact.category}`);
  console.log(`Since hours:    ${artifact.since_hours}`);
  console.log(`Feeds fetched:  ${artifact.total_feeds_attempted}`);
  console.log(`Feeds failed:   ${artifact.total_feeds_failed}`);
  console.log(`Feeds bad RSS:  ${artifact.total_feeds_bad}`);
  if (aiFilterPrompt) {
    console.log(`Items (pre-AI): ${finalItems.length}`);
    console.log(`Items (post-AI):${publishItems.length}`);
  } else {
    console.log(`Items found:    ${publishItems.length}`);
  }
  console.log("─────────────────────────────────────────────────────────\n");

  if (publishItems.length === 0) {
    console.warn(
      "No items found for this topic. Try broader patterns, fewer exclusions, a larger since_hours window, or more feeds.",
    );
  } else {
    for (const item of publishItems) {
      const date = item.published
        ? new Date(item.published).toLocaleDateString("pt-BR")
        : "no date";
      console.log(`• [${date}] score=${item.score} ${item.title}`);
      console.log(`  ${item.source} — ${item.link}`);
    }
  }

  // ── 10. Save artifact (merge with existing day file) ──────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const artifactName = group ? `fetched-items-${group}-${today}` : `fetched-items-${today}`;

  if (publishItems.length > 0) {
    // Tenta carregar o artefato já existente do dia via fs
    let existingItems = [];
    const artifactPath = path.join(artifactsDir, `${artifactName}.json`);
    try {
      const raw = fs.readFileSync(artifactPath, "utf8");
      const existingArtifact = JSON.parse(raw);
      if (Array.isArray(existingArtifact?.items)) {
        existingItems = existingArtifact.items;
      }
    } catch {
      // Arquivo ainda não existe — primeira execução do dia
    }

    // Mescla: existentes mantêm posição/índice fixos, novos vão ao final ordenados por score
    const existingLinks = new Set(existingItems.map((i) => i.link));
    const trulyNewItems = publishItems.filter((i) => !existingLinks.has(i.link));

    trulyNewItems.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const da = a.published ? new Date(a.published) : 0;
      const db = b.published ? new Date(b.published) : 0;
      return db - da;
    });

    const mergedItems = [...existingItems, ...trulyNewItems];

    const mergedArtifact = {
      ...artifact,
      total_items_collected: mergedItems.length,
      items: mergedItems,
    };

    await saveArtifact(artifactName, mergedArtifact);
    console.log(
      `\nArtifact saved: ${artifactName}.json (${mergedItems.length} itens acumulados no dia, ${publishItems.length} novos)`,
    );
    flow?.("save_artifact", "ok", {
      artifact: `${artifactName}.json`,
      new_items: trulyNewItems.length,
      total_day: mergedItems.length,
    });
  } else {
    console.log(`\nNo new items — artifact not overwritten (${artifactName}.json preserved).`);
    flow?.(
      "save_artifact",
      "skipped",
      { artifact: `${artifactName}.json` },
      { reason: "no_new_items" },
    );
  }

  // ── 10b. Track items that entered the pipeline (observability) ────────────
  for (const item of finalItems) {
    track?.({
      itemId: itemIdFromUrl(item.link),
      group,
      step: "fetch",
      status: "ok",
      title: item.title,
      url: item.link,
      meta: { score: item.score, source: item.source },
    });
  }

  // ── 11. Update seen-hashes with this execution's items ───────────────────
  appendToSeenHashes(seenHashes, finalItems);
  saveSeenHashes(artifactsDir, seenHashes, group);
  console.log(`[seen_hashes] Updated with ${finalItems.length} new fingerprint(s).`);
  flow?.("update_history", "ok", { fingerprints: finalItems.length });

  // ── 12. Cleanup ───────────────────────────────────────────────────────────
  const now = new Date();
  let deletedArtifacts = 0;

  // 12a. Delete old dated artifact files by date in filename
  try {
    const files = fs.readdirSync(artifactsDir);
    for (const file of files) {
      const match = file.match(/^fetched-items-.*-(\d{4}-\d{2}-\d{2})\.json$/);
      if (match) {
        const fileDate = new Date(match[1]);
        const diffDays = (now - fileDate) / (1000 * 60 * 60 * 24);
        if (diffDays > keepDays) {
          fs.unlinkSync(path.join(artifactsDir, file));
          deletedArtifacts++;
          console.log("Deleted old artifact:", file);
        }
      }
    }
    flow?.("cleanup", "ok", { deleted: deletedArtifacts });
  } catch (err) {
    console.warn("[cleanup] Failed to delete old artifacts:", err.message);
    flow?.("cleanup", "failed", null, { error: err });
  }
}
