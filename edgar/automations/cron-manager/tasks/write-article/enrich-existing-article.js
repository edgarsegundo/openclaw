// Script para enriquecer um artigo existente usando enrichArticle
// Uso: node enrich-existing-article.js <caminho/do/artigo.json>

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { enrichArticle } from "./article-enricher.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (process.argv.length < 3) {
  console.error("Uso: node enrich-existing-article.js <caminho/do/artigo.json>");
  process.exit(1);
}

const inputPath = path.resolve(process.argv[2]);
if (!fs.existsSync(inputPath)) {
  console.error(`Arquivo não encontrado: ${inputPath}`);
  process.exit(1);
}

const raw = fs.readFileSync(inputPath, "utf8");
let artifact;
try {
  artifact = JSON.parse(raw);
} catch (err) {
  console.error("Erro ao fazer parse do JSON:", err.message);
  process.exit(1);
}

// Permite passar citations/searchResults/usage via arquivo, se existirem
const citations = artifact.citations || [];
const searchResults = artifact.searchResults || [];
const usage = artifact.usage || {};

const { enrichedMarkdown, enrichedArtifact } = enrichArticle({
  artifact,
  citations,
  searchResults,
  usage,
});

// Salva os arquivos enriquecidos ao lado do original
const outBase = inputPath.replace(/\.json$/, "");
const mdPath = `${outBase}.enriched.md`;
const jsonPath = `${outBase}.enriched.json`;

fs.writeFileSync(mdPath, enrichedMarkdown.replace(/\\n/g, "\n"), "utf8");
fs.writeFileSync(jsonPath, JSON.stringify(enrichedArtifact, null, 2), "utf8");

console.log(`Enriquecimento concluído!`);
console.log(`- Markdown: ${mdPath}`);
console.log(`- JSON:     ${jsonPath}`);
