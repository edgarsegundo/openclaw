import { sanitizeMarkdownHtml } from "../common/sanitizeMarkdownHtml.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function classifySource(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();

    if (/\.(gov|mil)(\.|$)/.test(host) || host.includes("embaixada")) {
      return { emoji: "🏛️", label: "Oficial", cssClass: "oficial" };
    }

    if (/\.(edu|ac\.)/.test(host)) {
      return { emoji: "🎓", label: "Acadêmico", cssClass: "academico" };
    }

    const news = [
      "reuters", "bbc", "folha", "globo", "uol",
      "estadao", "cnn", "nytimes", "washingtonpost",
      "g1", "veja", "exame",
    ];

    if (news.some((kw) => host.includes(kw))) {
      return { emoji: "📰", label: "Jornalístico", cssClass: "jornal" };
    }
  } catch {}

  return { emoji: "🌐", label: "Web", cssClass: "web" };
}

function fmtDate(dateStr) {
  const d = new Date(dateStr);

  return isNaN(d)
    ? null
    : d.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
}

function getMostRecentDate(searchResults) {
  const dates = searchResults
    .flatMap((r) => [r.last_updated, r.date])
    .map((d) => new Date(d))
    .filter((d) => !isNaN(d));

  return dates.length
    ? fmtDate(new Date(Math.max(...dates)).toISOString())
    : null;
}

function extractCitationIndices(text) {
  const fromBrackets = [...text.matchAll(/\[(\d+)\]/g)]
    .map((m) => parseInt(m[1], 10));

  const fromAnchors = [...text.matchAll(/href="#fonte-(\d+)"/g)]
    .map((m) => parseInt(m[1], 10));

  return [...new Set([...fromBrackets, ...fromAnchors])]
    .toSorted((a, b) => a - b);
}

function splitIntoH2Sections(markdown) {
  const lines = markdown.split("\n");
  const sections = [];
  let current = { heading: null, body: [] };

  for (const line of lines) {
    if (/^## (?!#)/.test(line)) {
      sections.push({
        heading: current.heading,
        body: current.body.join("\n"),
      });

      current = {
        heading: line,
        body: [],
      };
    } else {
      current.body.push(line);
    }
  }

  sections.push({
    heading: current.heading,
    body: current.body.join("\n"),
  });

  return sections;
}

function sanitizeSourceTitle(title) {
  return (title ?? "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .trim();
}

function sanitizeSnippetText(text) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/^#+\s+/gm, "")
    .replace(/\n+/g, " ")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .trim();
}

function safeHref(url) {
  return url.replace(/"/g, "%22").replace(/'/g, "%27");
}

function buildSourceMeta(citations, searchResults) {
  return citations.map((url, idx) => {
    const source = searchResults[idx] ?? {};
    const meta = classifySource(url);

    return {
      citation: idx + 1,
      url,
      title: source.title ?? null,
      snippet: source.snippet ?? null,
      date: source.date ?? null,
      lastUpdated: source.last_updated ?? null,
      sourceType: meta.label,
      sourceEmoji: meta.emoji,
      cssClass: meta.cssClass,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Freshness badge
// ─────────────────────────────────────────────────────────────────────────────

function buildFreshnessHtml(searchResults, usage, generatedAt) {
  const mostRecent = getMostRecentDate(searchResults);

  return `\n<div class="article-freshness">\n  ${
    [
      `<span>📅 Gerado em: <strong>${generatedAt}</strong></span>`,
      mostRecent && `<span>🔄 Fonte mais recente: <strong>${mostRecent}</strong></span>`,
      `<span>🔍 Fontes: <strong>${searchResults.length}</strong></span>`,
      usage?.num_search_queries &&
        `<span>🌐 Buscas: <strong>${usage.num_search_queries}</strong></span>`,
    ].filter(Boolean).join("\n  ")
  }\n</div>\n\n`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline citations
// ─────────────────────────────────────────────────────────────────────────────

function transformInlineCitations(markdown, searchResults) {
  return markdown
    .split(/(```[\s\S]*?```|`[^`\n]+`)/g)
    .map((part, i) => {
      if (i % 2 === 1) {return part;}

      return part.replace(/\[(\d+)\]/g, (match, numStr) => {
        const source = searchResults[parseInt(numStr, 10) - 1];

        if (!source) {return match;}

        return `<a class="cite-ref" href="#fonte-${numStr}" data-title="${sanitizeSourceTitle(source.title)}"><sup>[${numStr}]</sup></a>`;
      });
    })
    .join("");
}

// ─────────────────────────────────────────────────────────────────────────────
// Source cards
// ─────────────────────────────────────────────────────────────────────────────

function buildSourceCardsHtml(sources) {
  if (!sources.length) {return "";}

  const cards = [...sources]
    .sort(
      (a, b) =>
        new Date(b.lastUpdated ?? b.date ?? 0) -
        new Date(a.lastUpdated ?? a.date ?? 0)
    )
    .map((s) => {
      const title = sanitizeSourceTitle(s.title ?? s.url);
      const date = fmtDate(s.lastUpdated ?? s.date);

      const extras = [
        date && `<div class="source-date">🗓 ${date}</div>`,
        s.snippet &&
          `<div class="source-snippet">${sanitizeSnippetText(s.snippet.slice(0, 240))}${s.snippet.length > 240 ? "…" : ""}</div>`,
      ]
        .filter(Boolean)
        .join("\n    ");

      return `<div class="source-card" id="fonte-${s.citation}">
  <div class="source-num">[${s.citation}]</div>
  <div class="source-body">
    <div class="source-title">
      <a href="${safeHref(s.url)}" target="_blank" rel="noopener noreferrer">${title}</a>
      <span class="source-badge ${s.cssClass}">${s.sourceEmoji} ${s.sourceType}</span>
    </div>${extras ? `\n    ${extras}` : ""}
  </div>
</div>`;
    })
    .join("\n");

  return `\n\n---\n\n<div class="sources-section">\n<h2>📚 Fontes</h2>\n${cards}\n</div>\n`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main pipeline
// ─────────────────────────────────────────────────────────────────────────────

export function enrichArticle({
  artifact,
  citations = [],
  searchResults = [],
  usage = {},
}) {
  const generatedAt = new Date().toISOString().slice(0, 10);

  const sources = citations.length
    ? buildSourceMeta(citations, searchResults)
    : [];

  let md = artifact.markdownText;

  if (searchResults.length) {
    md = md.replace(
      /^(# .+)$/m,
      `$1\n\n${buildFreshnessHtml(searchResults, usage, generatedAt)}`
    );
  }

  if (searchResults.length) {
    md = transformInlineCitations(md, searchResults);
  }

  md = md.trimEnd() + buildSourceCardsHtml(sources);

  md = sanitizeMarkdownHtml(md.trim());

  return {
    enrichedMarkdown: md,
    enrichedArtifact: {
      ...artifact,
      markdownText: md,
      generatedAt,
      citations,
      searchResults,
      usage,
      sources,
      research: {
        numSources: citations.length,
        numSearchQueries: usage?.num_search_queries ?? null,
        searchContextSize: usage?.search_context_size ?? null,
        promptTokens: usage?.prompt_tokens ?? null,
        completionTokens: usage?.completion_tokens ?? null,
        citationTokens: usage?.citation_tokens ?? null,
        costUsd: usage?.cost?.total_cost ?? null,
      },
    },
  };
}
