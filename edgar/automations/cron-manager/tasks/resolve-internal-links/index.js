import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Retrocompatibilidade: o prompt (user.md) usava antes o formato de placeholder
// <!--[[LINK: slug | âncora]]--> que era resolvido aqui para [âncora](/blog/slug).
// O prompt foi atualizado para gerar links diretos [âncora](/blog/slug) desde a geração,
// tornando este passe desnecessário para artigos novos. Mantido para processar artigos
// gerados antes da mudança que ainda contenham placeholders no .md.
// Group 1 = slug, Group 2 = anchor text
const LINK_PLACEHOLDER_RE = /<!--\[\[LINK:\s*([^\]|]+?)\s*\|\s*([^\]]+?)\s*\]\]-->/g;

// Matches nested links: [outer anchor]([inner text](/slug)) or [outer anchor]([inner text](/slug "title"))
// Group 1 = outer anchor, Group 2 = slug
const NESTED_LINK_RE = /\[([^\]]+)\]\(\[[^\]]*\]\(\/([^) "]+)[^)]*\)\)/g;

// Matches direct links without /blog/ prefix: [anchor](/slug) where slug has no slashes
// Group 1 = anchor, Group 2 = slug
const BARE_SLUG_LINK_RE = /\[([^\]]+)\]\(\/([^/][^) ]+)\)/g;

export default async function (context) {
  const { taskName, mode, executionId, saveArtifact, inputs } = context;

  console.log(`Task: ${taskName} | Mode: ${mode} | ID: ${executionId}`);

  const clusterFolder = inputs.cluster_folder;
  const clusterJsonPath = path.join(
    __dirname, "..", "write-article", "inputs", clusterFolder, "cluster.result.json"
  );

  if (!fs.existsSync(clusterJsonPath)) {
    throw new Error(`cluster.result.json não encontrado: ${clusterJsonPath}`);
  }

  const clusterData = JSON.parse(fs.readFileSync(clusterJsonPath, "utf8"));

  if (!Array.isArray(clusterData.articleInputs)) {
    throw new Error("cluster.result.json não contém campo articleInputs[]");
  }

  // Todos os slugs válidos do cluster (pillar + satellites)
  const validSlugs = new Set(clusterData.articleInputs.map((a) => a.slug));
  console.log(`\nSlugs válidos no cluster (${validSlugs.size}):`);
  for (const slug of validSlugs) {
    console.log(`  • ${slug}`);
  }

  const articlesDir = path.join(__dirname, "..", "..", "artifacts", "write-article");

  const summary = {
    clusterFolder,
    processedAt: new Date().toISOString(),
    articles: [],
  };

  for (const article of clusterData.articleInputs) {
    const mdPath = path.join(articlesDir, `${article.slug}.md`);

    if (!fs.existsSync(mdPath)) {
      console.warn(`\n⚠ Arquivo não encontrado, pulando: artifacts/write-article/${article.slug}.md`);
      summary.articles.push({ slug: article.slug, status: "skipped", reason: "file not found" });
      continue;
    }

    let md = fs.readFileSync(mdPath, "utf8");

    const warnings = [];
    let resolvedCount = 0;
    let keptCount = 0;

    // Passe 1: resolve placeholders <!--[[LINK: slug | anchor]]-->
    md = md.replace(LINK_PLACEHOLDER_RE, (match, slug, anchor) => {
      slug = slug.trim();
      anchor = anchor.trim();
      if (validSlugs.has(slug)) {
        resolvedCount++;
        return `[${anchor}](/blog/${slug})`;
      } else {
        keptCount++;
        warnings.push(`slug desconhecido: "${slug}" (âncora: "${anchor}")`);
        return match; // mantém o placeholder para revisão manual
      }
    });

    // Passe 2: normaliza links aninhados [outer]([inner](/slug)) → [outer](/blog/slug)
    md = md.replace(NESTED_LINK_RE, (match, anchor, slug) => {
      if (validSlugs.has(slug)) {
        resolvedCount++;
        return `[${anchor}](/blog/${slug})`;
      } else {
        warnings.push(`link aninhado com slug desconhecido: "${slug}" (âncora: "${anchor}")`);
        return match;
      }
    });

    // Passe 3: adiciona /blog/ em links diretos [anchor](/slug) sem prefixo
    md = md.replace(BARE_SLUG_LINK_RE, (match, anchor, slug) => {
      if (!validSlugs.has(slug)) return match; // não é slug do cluster, não mexe
      resolvedCount++;
      return `[${anchor}](/blog/${slug})`;
    });

    fs.writeFileSync(mdPath, md, "utf8");

    if (warnings.length > 0) {
      console.warn(`\n⚠ ${article.slug}.md — slugs não resolvidos:`);
      for (const w of warnings) {
        console.warn(`  • ${w}`);
      }
    } else {
      console.log(`✓ ${article.slug}.md — resolvidos: ${resolvedCount}`);
    }

    if (resolvedCount > 0 || keptCount > 0) {
      console.log(`  resolvidos: ${resolvedCount} | mantidos: ${keptCount}`);
    }

    summary.articles.push({
      slug: article.slug,
      status: "processed",
      resolved: resolvedCount,
      kept: keptCount,
      warnings,
    });
  }

  const totalResolved = summary.articles.reduce((s, a) => s + (a.resolved ?? 0), 0);
  const totalKept = summary.articles.reduce((s, a) => s + (a.kept ?? 0), 0);
  const totalSkipped = summary.articles.filter((a) => a.status === "skipped").length;
  const totalWarnings = summary.articles.reduce((s, a) => s + (a.warnings?.length ?? 0), 0);

  console.log("\n─── Resumo ──────────────────────────────────");
  console.log(`Artigos processados: ${summary.articles.length - totalSkipped}`);
  console.log(`Artigos pulados:     ${totalSkipped}`);
  console.log(`Links resolvidos:    ${totalResolved}`);
  console.log(`Links mantidos:      ${totalKept}`);
  if (totalWarnings > 0) {
    console.log(`⚠ Warnings:          ${totalWarnings} (slugs não encontrados no cluster)`);
  }

  const artifactName = `resolve-links-${clusterFolder}`;
  await saveArtifact(artifactName, summary);
  console.log(`\nArtifact salvo: artifacts/resolve-internal-links/${artifactName}.json`);
  console.log("Done!");
}
