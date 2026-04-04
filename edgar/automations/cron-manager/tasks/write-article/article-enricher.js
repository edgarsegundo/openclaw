/**
 * article-enricher.js
 *
 * Enriquece artigos gerados pelo Sonar injetando HTML inline diretamente
 * no arquivo .md — compatível com Astro (e qualquer framework que processe
 * markdown com HTML misturado, como MDX, Hugo, Jekyll, etc.).
 *
 * O Astro passa o arquivo .md pelo seu content pipeline, que preserva
 * blocos HTML inline como estão — o mesmo padrão que você já usa com
 * <table>, <img> e outros elementos no seu conteúdo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SAÍDAS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   enrichedMarkdown   — o .md final com todas as injeções. É o único arquivo
 *                        que você precisa salvar em disco. O Astro cuida do resto.
 *
 *   enrichedArtifact   — objeto para saveArtifact com provenance completo:
 *                        sources[], research{ custo, tokens, queries }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TRANSFORMAÇÕES APLICADAS (em ordem)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  1. BADGE DE FRESCOR
 *     Bloco HTML injetado logo após o H1. Mostra data de geração, data da
 *     fonte mais recente, nº de fontes e nº de buscas realizadas.
 *     → Sinaliza conteúdo atualizado para o leitor e para SEO (freshness).
 *     → Use case: artigos sobre vistos, leis, preços — conteúdo que muda.
 *
 *  2. CITAÇÕES INLINE COM TOOLTIP
 *     Marcadores [1][8] no texto viram superscripts HTML clicáveis.
 *     Ao passar o mouse, um tooltip CSS puro exibe o título da fonte.
 *     Ao clicar, ancora até o card da fonte na seção #fontes.
 *     → Zero JS. Funciona no Astro sem nenhum componente extra.
 *     → Use case: artigos de pesquisa, guias, fact-checking.
 *
 *  3. BLOCOS "SAIBA MAIS" POR SEÇÃO H2
 *     Detecta quais fontes foram citadas em cada seção e injeta um bloco
 *     HTML no final da seção com links diretos para essas fontes.
 *     → Reduz bounce rate — leitor aprofunda sem sair do artigo primeiro.
 *     → Use case: guias longos com seções independentes.
 *
 *  4. SEÇÃO DE FONTES COM CARDS HTML
 *     Adicionada no final do .md. Cada fonte vira um card com:
 *       • Badge de tipo: 🏛️ Oficial (.gov) / 📰 Jornalístico / 🎓 Acadêmico / 🌐 Web
 *       • Título com link (abre em nova aba)
 *       • Data da última atualização da fonte
 *       • Snippet — trecho relevante extraído pelo Sonar
 *     Cards ordenados da fonte mais recente para a mais antiga.
 *     → Use case: transparência editorial, confiança do leitor, SEO de autoridade.
 *
 *  5. CSS NO TOPO DO .md (uma vez, via <style> tag)
 *     Todos os estilos ficam em um bloco <style> no início do arquivo.
 *     O Astro preserva e injeta no <head> ou inline dependendo do seu layout.
 *     → Zero dependências externas. Compatível com qualquer tema Astro.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CLASSIFICAÇÃO DE FONTES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   🏛️ Oficial      — domínios .gov, .mil, "embaixada"
 *   🎓 Acadêmico    — domínios .edu, .ac.
 *   📰 Jornalístico — reuters, bbc, folha, globo, uol, estadao, cnn, g1, etc.
 *   🌐 Web          — demais domínios
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CAMPOS DO enrichedArtifact
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   sources[]
 *     { citation, url, title, snippet, date, lastUpdated, sourceType, sourceEmoji }
 *     → Use case: reprocessar fontes, detectar fontes desatualizadas em cron jobs,
 *       popular um CMS com metadados de referência, auditoria editorial.
 *
 *   research{}
 *     { numSources, numSearchQueries, searchContextSize,
 *       promptTokens, completionTokens, citationTokens, costUsd }
 *     → Use case: dashboard de custo por artigo, alertas de budget,
 *       comparar custo sonar vs sonar-pro por tipo de conteúdo,
 *       detectar artigos caros (citationTokens alto = muitas fontes longas).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * USO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   import { enrichArticle } from "./article-enricher.js";
 *
 *   const { enrichedMarkdown, enrichedArtifact } = enrichArticle({
 *     artifact,       // { markdownText, title, slug, ... }
 *     citations,      // string[]  — URLs das fontes
 *     searchResults,  // object[]  — metadados ricos das fontes
 *     usage,          // object    — tokens e custo do Sonar
 *   });
 */

// ─────────────────────────────────────────────────────────────────────────────
// CSS — injetado como bloco <style> no topo do .md
// ─────────────────────────────────────────────────────────────────────────────

const ARTICLE_CSS = `<style>
/* ── Citações inline com tooltip ── */
.cite-ref {
  position: relative;
  display: inline-block;
  text-decoration: none;
}
.cite-ref sup {
  color: #1d4ed8;
  font-size: 0.72em;
  font-weight: 700;
  padding: 0 2px;
  border-bottom: 1.5px dotted #1d4ed8;
  cursor: pointer;
  line-height: 1;
}
.cite-ref::after {
  content: attr(data-title);
  position: absolute;
  bottom: calc(100% + 7px);
  left: 50%;
  transform: translateX(-50%);
  background: #0f172a;
  color: #f1f5f9;
  font-size: 0.76rem;
  line-height: 1.45;
  padding: 6px 11px;
  border-radius: 7px;
  white-space: nowrap;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  box-shadow: 0 6px 18px rgba(0,0,0,0.28);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.14s ease;
  z-index: 50;
}
.cite-ref::before {
  content: "";
  position: absolute;
  bottom: calc(100% + 2px);
  left: 50%;
  transform: translateX(-50%);
  border: 5px solid transparent;
  border-top-color: #0f172a;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.14s ease;
  z-index: 50;
}
.cite-ref:hover::after,
.cite-ref:hover::before { opacity: 1; }

/* ── Badge de frescor ── */
.article-freshness {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  background: #f0f9ff;
  border-left: 4px solid #0ea5e9;
  border-radius: 0 8px 8px 0;
  padding: 10px 16px;
  font-size: 0.82rem;
  color: #0369a1;
  margin: 12px 0 28px;
}
.article-freshness span { white-space: nowrap; }

/* ── Bloco "Saiba mais" ── */
.learn-more {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px 16px;
  font-size: 0.85rem;
  margin: 20px 0 4px;
  color: #334155;
  line-height: 1.6;
}
.learn-more strong { color: #1e293b; }
.learn-more a { color: #1d4ed8; text-decoration: none; margin: 0 2px; }
.learn-more a:hover { text-decoration: underline; }

/* ── Seção de fontes ── */
.sources-section {
  margin-top: 48px;
  border-top: 2px solid #e2e8f0;
  padding-top: 24px;
}
.sources-section h2 {
  font-size: 1.05rem;
  font-weight: 700;
  color: #475569;
  margin-bottom: 18px;
  letter-spacing: 0.01em;
}
.source-card {
  display: flex;
  gap: 14px;
  padding: 13px 16px;
  background: #f8fafc;
  border-left: 3px solid #3b82f6;
  border-radius: 0 8px 8px 0;
  margin-bottom: 10px;
  font-size: 0.84rem;
  scroll-margin-top: 80px;
}
.source-num {
  font-weight: 800;
  color: #94a3b8;
  min-width: 28px;
  padding-top: 2px;
  font-size: 0.8rem;
}
.source-body { flex: 1; min-width: 0; }
.source-title { font-weight: 600; color: #1e293b; margin-bottom: 4px; }
.source-title a {
  color: #1d4ed8;
  text-decoration: none;
  word-break: break-word;
}
.source-title a:hover { text-decoration: underline; }
.source-badge {
  display: inline-block;
  font-size: 0.67rem;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 4px;
  margin-left: 7px;
  vertical-align: middle;
  white-space: nowrap;
}
.source-badge.oficial    { background: #dcfce7; color: #166534; }
.source-badge.academico  { background: #fef9c3; color: #854d0e; }
.source-badge.jornal     { background: #fce7f3; color: #9d174d; }
.source-badge.web        { background: #f1f5f9; color: #475569; }
.source-date { font-size: 0.76rem; color: #94a3b8; margin-bottom: 5px; }
.source-snippet {
  color: #64748b;
  font-style: italic;
  line-height: 1.55;
  font-size: 0.83rem;
}
</style>`;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classifica a fonte pelo domínio.
 * @param {string} url
 * @returns {{ emoji: string, label: string, cssClass: string }}
 */
function classifySource(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (/\.(gov|mil)(\.|$)/.test(host) || host.includes("embaixada")) {
      return { emoji: "🏛️", label: "Oficial", cssClass: "oficial" };
    }
    if (/\.(edu|ac\.)/.test(host)) {
      return { emoji: "🎓", label: "Acadêmico", cssClass: "academico" };
    }
    const news = ["reuters","bbc","folha","globo","uol","estadao","cnn","nytimes","washingtonpost","g1","veja","exame"];
    if (news.some((kw) => host.includes(kw))) {
      return { emoji: "📰", label: "Jornalístico", cssClass: "jornal" };
    }
  } catch { /* url inválida */ }
  return { emoji: "🌐", label: "Web", cssClass: "web" };
}

/**
 * Formata data para pt-BR legível. Retorna null se inválida.
 * @param {string|undefined} dateStr
 * @returns {string|null}
 */
function fmtDate(dateStr) {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (isNaN(d)) return null;
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return null; }
}

/**
 * Data mais recente entre todos os searchResults.
 * @param {object[]} searchResults
 * @returns {string|null}
 */
function getMostRecentDate(searchResults) {
  const dates = searchResults
    .flatMap((r) => [r.last_updated, r.date])
    .filter(Boolean)
    .map((d) => { try { return new Date(d); } catch { return null; } })
    .filter((d) => d && !isNaN(d));
  if (!dates.length) return null;
  return fmtDate(new Date(Math.max(...dates)).toISOString());
}

/**
 * Extrai índices de citação únicos de um bloco de texto.
 * "[1][3][8] ... [3]" → [1, 3, 8]
 * @param {string} text
 * @returns {number[]}
 */
function extractCitationIndices(text) {
  return [
    ...new Set([...text.matchAll(/\[(\d+)\]/g)].map((m) => parseInt(m[1], 10))),
  ].sort((a, b) => a - b);
}

/**
 * Divide markdown em seções pelo marcador H2 (## ), preservando o preâmbulo.
 * @param {string} markdown
 * @returns {{ heading: string|null, body: string }[]}
 */
function splitIntoH2Sections(markdown) {
  const lines = markdown.split("\n");
  const sections = [];
  let current = { heading: null, body: [] };
  for (const line of lines) {
    if (/^## (?!#)/.test(line)) {
      sections.push({ heading: current.heading, body: current.body.join("\n") });
      current = { heading: line, body: [] };
    } else {
      current.body.push(line);
    }
  }
  sections.push({ heading: current.heading, body: current.body.join("\n") });
  return sections;
}

// ─────────────────────────────────────────────────────────────────────────────
// Transformação 1 — Badge de frescor (HTML inline)
// ─────────────────────────────────────────────────────────────────────────────

function buildFreshnessHtml(searchResults, usage, generatedAt) {
  const mostRecent = getMostRecentDate(searchResults);
  const parts = [
    `<span>📅 Gerado em: <strong>${generatedAt}</strong></span>`,
    mostRecent ? `<span>🔄 Fonte mais recente: <strong>${mostRecent}</strong></span>` : null,
    `<span>🔍 Fontes: <strong>${searchResults.length}</strong></span>`,
    usage?.num_search_queries
      ? `<span>🌐 Buscas: <strong>${usage.num_search_queries}</strong></span>`
      : null,
  ].filter(Boolean).join("\n  ");

  return `<div class="article-freshness">
  ${parts}
</div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Transformação 2 — Citações inline [N] → HTML com tooltip
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Substitui [N] por HTML de citação com tooltip.
 * Preserva qualquer [N] cujo índice não existe em searchResults.
 */
function transformInlineCitations(markdown, searchResults) {
  return markdown.replace(/\[(\d+)\]/g, (match, numStr) => {
    const idx = parseInt(numStr, 10) - 1; // [1] → índice 0
    const source = searchResults[idx];
    if (!source) return match;
    // Escapa aspas duplas do título para não quebrar o atributo data-title
    const safeTitle = (source.title ?? "").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    return `<a class="cite-ref" href="#fonte-${numStr}" data-title="${safeTitle}"><sup>[${numStr}]</sup></a>`;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Transformação 3 — Bloco "Saiba mais" por seção H2
// ─────────────────────────────────────────────────────────────────────────────

function injectLearnMoreBlocks(markdown, citations, searchResults) {
  const sections = splitIntoH2Sections(markdown);

  return sections.map(({ heading, body }) => {
    // Preâmbulo ou seção sem H2
    if (!heading) return body;

    const indices = extractCitationIndices(heading + "\n" + body);
    if (!indices.length) return `${heading}\n${body}`;

    const links = indices
      .map((n) => {
        const source = searchResults[n - 1];
        const url = citations[n - 1];
        if (!source || !url) return null;
        const title = (source.title ?? url).replace(/</g, "&lt;").replace(/>/g, "&gt;");
        return `<a href="${url}" target="_blank" rel="noopener noreferrer">${title}</a>`;
      })
      .filter(Boolean)
      .join(" · ");

    if (!links) return `${heading}\n${body}`;

    const learnMore = `\n<div class="learn-more"><strong>📖 Saiba mais:</strong> ${links}</div>`;
    return `${heading}\n${body}${learnMore}`;
  }).join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Transformação 4 — Seção de fontes com cards HTML
// ─────────────────────────────────────────────────────────────────────────────

function buildSourceCardsHtml(citations, searchResults) {
  if (!citations.length) return "";

  // Cria array com índice original + objeto de data para ordenação
  const items = citations.map((url, idx) => {
    const s = searchResults[idx] ?? {};
    const rawDate = s.last_updated ?? s.date;
    const dateObj = rawDate ? (() => { try { return new Date(rawDate); } catch { return new Date(0); } })() : new Date(0);
    return { n: idx + 1, url, source: s, dateObj };
  });

  // Ordena do mais recente para o mais antigo
  items.sort((a, b) => b.dateObj - a.dateObj);

  const cards = items.map(({ n, url, source }) => {
    const { emoji, label, cssClass } = classifySource(url);
    const title = (source.title ?? url).replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const date = fmtDate(source.last_updated ?? source.date);
    const dateHtml = date
      ? `<div class="source-date">🗓 ${date}</div>`
      : "";
    const snippet = source.snippet
      ? `<div class="source-snippet">${source.snippet.slice(0, 240).replace(/</g, "&lt;").replace(/>/g, "&gt;")}${source.snippet.length > 240 ? "…" : ""}</div>`
      : "";

    return `<div class="source-card" id="fonte-${n}">
  <div class="source-num">[${n}]</div>
  <div class="source-body">
    <div class="source-title">
      <a href="${url}" target="_blank" rel="noopener noreferrer">${title}</a>
      <span class="source-badge ${cssClass}">${emoji} ${label}</span>
    </div>
    ${dateHtml}
    ${snippet}
  </div>
</div>`;
  }).join("\n");

  return `\n\n---\n\n<div class="sources-section">
<h2>📚 Fontes</h2>
${cards}
</div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline principal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Aplica todas as transformações e retorna o .md enriquecido e o artifact
 * com provenance completo.
 *
 * @param {object}   params
 * @param {object}   params.artifact         - Artifact original do runPrompt
 * @param {string}   params.artifact.markdownText
 * @param {string}   params.artifact.title
 * @param {string}   params.artifact.slug
 * @param {string[]} params.citations         - URLs das fontes (SonarResult.citations)
 * @param {object[]} params.searchResults     - Metadados das fontes (SonarResult.searchResults)
 * @param {object}   params.usage             - Tokens e custo (SonarResult.usage)
 *
 * @returns {{
 *   enrichedMarkdown: string,
 *   enrichedArtifact: object
 * }}
 */
export function enrichArticle({ artifact, citations = [], searchResults = [], usage = {} }) {
  const generatedAt = new Date().toISOString().slice(0, 10);
  let md = artifact.markdownText;

  // 1. CSS no topo — injetado uma única vez antes de qualquer conteúdo
  md = `${ARTICLE_CSS}\n\n${md}`;

  // 2. Badge de frescor — logo após o H1
  const freshnessHtml = buildFreshnessHtml(searchResults, usage, generatedAt);
  md = md.replace(/^(# .+)$/m, `$1\n\n${freshnessHtml}`);

  // 3. Citações inline [N] → HTML com tooltip
  //    Feito ANTES dos blocos "Saiba mais" para não duplicar transformações
  md = transformInlineCitations(md, searchResults);

  // 4. Blocos "Saiba mais" ao final de cada seção H2
  //    Recebe o md já com tooltips — os índices ainda são detectáveis via href="#fonte-N"
  //    mas usamos o markdown original para detectar citações, então passamos o md
  //    com os [N] já transformados. A detecção de índices busca tanto [N] quanto cite-ref.
  md = injectLearnMoreBlocks(md, citations, searchResults);

  // 5. Seção de fontes com cards no final do .md
  md = md + buildSourceCardsHtml(citations, searchResults);

  // ── enrichedArtifact ──────────────────────────────────────────────────────
  const enrichedArtifact = {
    ...artifact,
    markdownText: md,
    generatedAt,
    citations,
    searchResults,
    usage,
    sources: citations.map((url, idx) => {
      const s = searchResults[idx] ?? {};
      const { emoji, label } = classifySource(url);
      return {
        citation: idx + 1,
        url,
        title: s.title ?? null,
        snippet: s.snippet ?? null,
        date: s.date ?? null,
        lastUpdated: s.last_updated ?? null,
        sourceType: label,
        sourceEmoji: emoji,
      };
    }),
    research: {
      numSources: citations.length,
      numSearchQueries: usage?.num_search_queries ?? null,
      searchContextSize: usage?.search_context_size ?? null,
      promptTokens: usage?.prompt_tokens ?? null,
      completionTokens: usage?.completion_tokens ?? null,
      citationTokens: usage?.citation_tokens ?? null,
      costUsd: usage?.cost?.total_cost ?? null,
    },
  };

  return { enrichedMarkdown: md, enrichedArtifact };
}
