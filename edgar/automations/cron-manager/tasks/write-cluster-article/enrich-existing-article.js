/**
 * enrich-existing-article.js
 *
 * Enriquece um artigo já gerado aplicando todas as transformações do
 * article-enricher.js: citações inline com tooltip, badge de frescor,
 * blocos "Saiba mais" por seção e seção de fontes com cards.
 *
 * O CSS das classes injetadas (.cite-ref, .article-freshness, .learn-more,
 * .source-card, etc.) vive em blog-article.css no projeto Astro —
 * nenhum <style> inline é adicionado ao .md.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * USO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   node enrich-existing-article.js <caminho/do/artigo.json>
 *
 * O JSON de entrada pode ter duas formas:
 *
 *   Forma A — artifact puro (saído do saveArtifact antes do enricher):
 *   {
 *     "markdownText": "...",
 *     "title": "...",
 *     "slug": "...",
 *     "citations": ["https://...", ...],
 *     "searchResults": [{ "title", "url", "snippet", "date", ... }],
 *     "usage": { "num_search_queries": 4, "cost": { "total_cost": 0.04 } }
 *   }
 *
 *   Forma B — SonarResult completo (retorno direto do sonarClient.generate):
 *   {
 *     "data": { "markdownText": "...", "title": "...", "slug": "..." },
 *     "citations": [...],
 *     "searchResults": [...],
 *     "usage": { ... }
 *   }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SAÍDAS (ao lado do arquivo de entrada)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   <slug>.enriched.md   — markdown enriquecido, pronto para o Astro
 *   <slug>.enriched.json — artifact completo com sources[] e research{}
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { enrichArticle } from "./article-enricher.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────────────────────────────────────
// Validação de argumentos
// ─────────────────────────────────────────────────────────────────────────────

if (process.argv.length < 3) {
  console.error("Uso: node enrich-existing-article.js <caminho/do/artigo.json>");
  process.exit(1);
}

const inputPath = path.resolve(process.argv[2]);

if (!fs.existsSync(inputPath)) {
  console.error(`Arquivo não encontrado: ${inputPath}`);
  process.exit(1);
}

if (!inputPath.endsWith(".json")) {
  console.error("O arquivo de entrada deve ser um .json");
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Leitura e parse do JSON
// ─────────────────────────────────────────────────────────────────────────────

let parsed;
try {
  parsed = JSON.parse(fs.readFileSync(inputPath, "utf8"));
} catch (err) {
  console.error(`Erro ao fazer parse do JSON: ${err.message}`);
  process.exit(1);
}

// Suporta Forma A (artifact direto) e Forma B (SonarResult com .data)
const artifact      = parsed.data ?? parsed;
const citations     = parsed.citations     ?? artifact.citations     ?? [];
const searchResults = parsed.searchResults ?? artifact.searchResults ?? [];
const usage         = parsed.usage         ?? artifact.usage         ?? {};

// Validação mínima — markdownText é obrigatório
if (!artifact.markdownText) {
  console.error(
    'O JSON não contém "markdownText". ' +
    'Certifique-se de passar um artifact válido (Forma A) ou um SonarResult (Forma B).'
  );
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Enriquecimento
// ─────────────────────────────────────────────────────────────────────────────

console.log(`Enriquecendo: ${path.basename(inputPath)}`);
console.log(`  Título:  ${artifact.title ?? "(sem título)"}`);
console.log(`  Fontes:  ${citations.length}`);
console.log(`  Buscas:  ${usage?.num_search_queries ?? "n/a"}`);
console.log(`  Custo:   ${usage?.cost?.total_cost != null ? `$${usage.cost.total_cost.toFixed(4)}` : "n/a"}`);

const { enrichedMarkdown, enrichedArtifact } = enrichArticle({
  artifact,
  citations,
  searchResults,
  usage,
});

// ─────────────────────────────────────────────────────────────────────────────
// Escrita dos arquivos de saída
// ─────────────────────────────────────────────────────────────────────────────

const outBase  = inputPath.replace(/\.json$/, "");
const mdPath   = `${outBase}.enriched.md`;
const jsonPath = `${outBase}.enriched.json`;

fs.writeFileSync(mdPath,   enrichedMarkdown.replace(/\\n/g, "\n"), "utf8");
fs.writeFileSync(jsonPath, JSON.stringify(enrichedArtifact, null, 2), "utf8");

console.log(`\nEnriquecimento concluído!`);
console.log(`  Markdown: ${mdPath}`);
console.log(`  JSON:     ${jsonPath}`);

if (enrichedArtifact.research?.costUsd != null) {
  console.log(`  Custo total da pesquisa: $${enrichedArtifact.research.costUsd.toFixed(4)}`);
}
