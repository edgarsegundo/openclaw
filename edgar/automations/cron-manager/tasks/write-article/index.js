import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { enrichArticle } from "./article-enricher.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveInputs(inputs, context) {
  // Se inputs._clusterJsonFile e inputs._articleIndex vieram do wrapper, faz o split
  if (inputs && typeof inputs === "object" && inputs._clusterJsonFile && typeof inputs._articleIndex === "number") {
    const clusterData = JSON.parse(fs.readFileSync(inputs._clusterJsonFile, "utf8"));
    if (!Array.isArray(clusterData.articleInputs)) {
      throw new Error("Arquivo JSON não contém campo articleInputs[]");
    }
    const idx = inputs._articleIndex;
    if (idx < 0 || idx >= clusterData.articleInputs.length) {
      throw new Error(`article-index ${idx} fora do intervalo (0-${clusterData.articleInputs.length - 1})`);
    }
    return clusterData.articleInputs[idx];
  }
  return inputs;
}

export default async function (context) {
  let { taskName, mode, executionId, runPrompt, saveArtifact, inputs } = context;

  // Suporte a cluster.result.json + índice
  inputs = resolveInputs(inputs, context);

  console.log(`Task: ${taskName} | Mode: ${mode} | ID: ${executionId}`);
  console.log("Inputs:", JSON.stringify(inputs, null, 2));

  if (!runPrompt) {
    throw new Error("runPrompt não disponível. Execute com --template searchable-ai");
  }

  // Busca artigo + metadados completos do Sonar
  const {
    artifact,
    model,
    citations = [],
    searchResults = [],
    usage = {},
  } = await runPrompt({
    ...inputs,
    date_today: new Date().toISOString().slice(0, 10),
  });

  console.log("--- Artigo gerado ---");
  console.log(`Título:         ${artifact.title}`);
  console.log(`Slug:           ${artifact.slug}`);
  console.log(`SEO Meta:       ${artifact.seoMetaDescription}`);
  console.log(`Palavras-chave: ${artifact.keywords.join(", ")}`);
  console.log(`Fontes:         ${citations.length}`);
  console.log(`Buscas feitas:  ${usage?.num_search_queries ?? "n/a"}`);
  console.log(`Custo USD:      ${usage?.cost?.total_cost ?? "n/a"}`);
  console.log("--- Trecho do markdown ---");
  console.log(artifact.markdownText.slice(0, 400) + (artifact.markdownText.length > 400 ? "..." : ""));

  // Salva artifact bruto antes de enriquecer — se enrichArticle falhar, esse arquivo persiste
  const rawArtifactName = `result-${artifact.slug}`;
  await saveArtifact(rawArtifactName, { artifact, citations, searchResults, usage });
  console.log(`Raw result saved: artifacts/write-article/${rawArtifactName}.json`);

  // Enriquece o artigo com todas as transformações
  const { enrichedMarkdown, enrichedArtifact } = enrichArticle({
    artifact,
    citations,
    searchResults,
    usage,
  });

  // Salva artifact JSON com provenance completo (sources[] + research{})
  await saveArtifact(`article-${artifact.slug}`, enrichedArtifact);

  // Salva o .md enriquecido — o Astro cuida da conversão para HTML estático
  const articlesDir = path.join(__dirname, "..", "..", "artifacts", "write-article");
  fs.mkdirSync(articlesDir, { recursive: true });

  const mdPath = path.join(articlesDir, `${artifact.slug}.md`);
  fs.writeFileSync(mdPath, enrichedMarkdown.replace(/\\n/g, "\n"), "utf8");
  console.log(`Markdown saved: artifacts/write-article/${artifact.slug}.md`);

  console.log(`\nModel used: ${model}`);
  console.log("Done!");
}
