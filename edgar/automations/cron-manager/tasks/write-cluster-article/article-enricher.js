import { sanitizeMarkdownHtml } from "./sanitizeMarkdownHtml.js";

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
 *  5. CSS 
 * ─────────────────────────────────────────────────────────────────────────────
 * CSS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   Os estilos das classes injetadas (.cite-ref, .article-freshness,
 *   .learn-more, .source-card, .source-badge, etc.) vivem em blog-article.css
 *   no projeto Astro — seção "Enricher Components" no final do arquivo.
 *   O enricher não injeta nenhum <style> inline.
 * 
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
  if (!dateStr) {return null;}
  try {
    const d = new Date(dateStr);
    if (isNaN(d)) {return null;}
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
  if (!dates.length) {return null;}
  return fmtDate(new Date(Math.max(...dates)).toISOString());
}

/**
 * Extrai índices de citação únicos de um bloco de texto.
 * "[1][3][8] ... [3]" → [1, 3, 8]
 * Também detecta citações já transformadas: href="#fonte-N"
 * @param {string} text
 * @returns {number[]}
 */
function extractCitationIndices(text) {
  const fromBrackets = [...text.matchAll(/\[(\d+)\]/g)].map((m) => parseInt(m[1], 10));
  const fromAnchors = [...text.matchAll(/href="#fonte-(\d+)"/g)].map((m) => parseInt(m[1], 10));
  return [...new Set([...fromBrackets, ...fromAnchors])].toSorted((a, b) => a - b);
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

  // \n\n after </div> is required: CommonMark needs a blank line to exit an HTML
  // block and resume parsing the next content as Markdown.
  return `\n<div class="article-freshness">\n  ${parts}\n</div>\n\n`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Transformação 2 — Citações inline [N] → HTML com tooltip
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Remove markdown e caracteres problemáticos do texto plano de um título de fonte.
 * Usado em atributos HTML (data-title) e textos de link.
 */
function sanitizeSourceTitle(title) {
  return (title ?? "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")  // [texto](url) → texto
    .replace(/[*_`~]/g, "")                    // markdown inline formatting
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .trim();
}

/**
 * Normaliza o texto de um snippet de fonte para uso seguro dentro de um bloco HTML.
 * - Colapsa todas as quebras de linha (incluindo linhas em branco) em espaço
 *   para evitar que o CommonMark encerre o bloco HTML prematuramente.
 * - Remove marcadores Markdown de heading (#) no início de linhas.
 */
function sanitizeSnippetText(text) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/^#+\s+/gm, "")        // remove # headings ANTES do colapso (m flag: ^ = início de cada linha)
    .replace(/\n+/g, " ")           // quebras de linha → espaço (impede blank line dentro do div)
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .trim();
}

/**
 * Escapa caracteres problemáticos em URLs para uso em atributos href.
 */
function safeHref(url) {
  return url.replace(/"/g, "%22").replace(/'/g, "%27");
}

/**
 * Substitui [N] por HTML de citação com tooltip.
 * Preserva qualquer [N] cujo índice não existe em searchResults.
 * Não transforma [N] dentro de inline code spans (`...`).
 */
function transformInlineCitations(markdown, searchResults) {
  // Split preservando code spans e code fences para não transformar [N] dentro deles
  const parts = markdown.split(/(```[\s\S]*?```|`[^`\n]+`)/g);
  return parts.map((part, i) => {
    if (i % 2 === 1) return part; // índices ímpares são code spans/fences — não tocar
    return part.replace(/\[(\d+)\]/g, (match, numStr) => {
      const idx = parseInt(numStr, 10) - 1; // [1] → índice 0
      const source = searchResults[idx];
      if (!source) {return match;}
      const safeTitle = sanitizeSourceTitle(source.title);
      return `<a class="cite-ref" href="#fonte-${numStr}" data-title="${safeTitle}"><sup>[${numStr}]</sup></a>`;
    });
  }).join("");
}

// ─────────────────────────────────────────────────────────────────────────────
// Transformação 3 — Bloco "Saiba mais" por seção H2
// ─────────────────────────────────────────────────────────────────────────────

function injectLearnMoreBlocks(markdown, citations, searchResults, enableLearnMoreBlocks = true) {
  const sections = splitIntoH2Sections(markdown);

  return sections.map(({ heading, body }) => {
    // Preâmbulo ou seção sem H2
    if (!heading) {return body;}

    const indices = extractCitationIndices(heading + "\n" + body);
    if (!indices.length) {return `${heading}\n${body}`;}

    const links = indices
      .map((n) => {
        const source = searchResults[n - 1];
        const url = citations[n - 1];
        if (!source || !url) {return null;}
        const title = sanitizeSourceTitle(source.title ?? url);
        return `<a href="${safeHref(url)}" target="_blank" rel="noopener noreferrer">${title}</a>`;
      })
      .filter(Boolean)
      .join(" · ");

    if (!links) {return `${heading}\n${body}`;}
    // \n\n before and after the div ensures it is an isolated HTML block
    const learnMore = `\n\n<div class="learn-more"><strong>📖 Saiba mais:</strong> ${links}</div>\n\n`;
    return `${heading}\n${body}${learnMore}`;

  }).join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Transformação 4 — Seção de fontes com cards HTML
// ─────────────────────────────────────────────────────────────────────────────

function buildSourceCardsHtml(citations, searchResults) {
  if (!citations.length) {return "";}

  const items = citations.map((url, idx) => {
    const s = searchResults[idx] ?? {};
    const rawDate = s.last_updated ?? s.date;
    const dateObj = rawDate
      ? (() => { try { return new Date(rawDate); } catch { return new Date(0); } })()
      : new Date(0);

    return { n: idx + 1, url, source: s, dateObj };
  });

  items.sort((a, b) => b.dateObj - a.dateObj);

  const cards = items.map(({ n, url, source }) => {
    const { emoji, label, cssClass } = classifySource(url);
    const title = sanitizeSourceTitle(source.title ?? url);
    const date = fmtDate(source.last_updated ?? source.date);

    const dateHtml = date
      ? `<div class="source-date">🗓 ${date}</div>`
      : "";

    // sanitizeSnippetText colapsa quebras de linha e linhas em branco em espaço —
    // necessário porque CommonMark encerra um bloco HTML na primeira linha em branco.
    const snippet = source.snippet
      ? `<div class="source-snippet">${sanitizeSnippetText(source.snippet.slice(0, 240))}${source.snippet.length > 240 ? "…" : ""}</div>`
      : "";

    // Filtra partes opcionais para não gerar linhas em branco dentro do bloco HTML.
    // Uma linha `    ${""}` vira só espaços → sanitizeMarkdownHtml descarta → blank line.
    const extras = [dateHtml, snippet].filter(Boolean).join("\n    ");
    const extrasHtml = extras ? `\n    ${extras}` : "";

    return `<div class="source-card" id="fonte-${n}">
  <div class="source-num">[${n}]</div>
  <div class="source-body">
    <div class="source-title">
      <a href="${safeHref(url)}" target="_blank" rel="noopener noreferrer">${title}</a>
      <span class="source-badge ${cssClass}">${emoji} ${label}</span>
    </div>${extrasHtml}
  </div>
</div>`;
  }).join("\n");

  // Retorna sem sanitizar aqui — o pipeline principal chama sanitizeMarkdownHtml
  // uma única vez sobre o md completo. O separador \n\n garante que o --- fique
  // isolado do parágrafo anterior após a concatenação com md.trimEnd().
  return `\n\n---\n\n<div class="sources-section">\n<h2>📚 Fontes</h2>\n${cards}\n</div>\n`;
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
export function enrichArticle({ artifact, citations = [], searchResults = [], usage = {}, enableLearnMoreBlocks = false }) {
  const generatedAt = new Date().toISOString().slice(0, 10);
  let md = artifact.markdownText;

  // 0. Normaliza placeholders LINK embutidos errado pelo LLM como href de link markdown:
  //    [texto](<!--[[LINK: slug | label]])   — falta --> antes do )
  //    [texto](<!--[[LINK: slug | label]]--> — com --> mas dentro de ()
  //    Ambos viram: texto standalone + placeholder correto
  md = md.replace(/\[([^\]]+)\]\(<!--\[\[LINK:[^\]]*\]\](?:-->)?\)/g, (_, anchor, offset, str) => {
    const raw = str.slice(offset).match(/\((<!--\[\[LINK:[^\]]*\]\])(?:-->)?\)/);
    const placeholder = raw ? raw[1] + "-->" : "";
    return `${anchor}${placeholder}`;
  });

  // 1. Badge de frescor — logo após o H1
  const freshnessHtml = buildFreshnessHtml(searchResults, usage, generatedAt);
  md = md.replace(/^(# .+)$/m, `$1\n\n${freshnessHtml}`);

  // 2. Citações inline [N] → HTML com tooltip
  //    Feito ANTES dos blocos "Saiba mais" para não duplicar transformações
  md = transformInlineCitations(md, searchResults);


  // 3. Blocos "Saiba mais" ao final de cada seção H2
  //    Recebe o md já com tooltips — os índices ainda são detectáveis via href="#fonte-N"
  //    mas usamos o markdown original para detectar citações, então passamos o md
  //    com os [N] já transformados. A detecção de índices busca tanto [N] quanto cite-ref.
  if (enableLearnMoreBlocks) {
    md = injectLearnMoreBlocks(md, citations, searchResults);
  }

  // 4. Seção de fontes com cards no final do .md
  // trimEnd() + separador explícito evita o --- grudar no último parágrafo
  md = md.trimEnd() + buildSourceCardsHtml(citations, searchResults);

  // 5. SANITIZE — chamado uma única vez aqui sobre o md completo
  md = sanitizeMarkdownHtml(md.trim());

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
