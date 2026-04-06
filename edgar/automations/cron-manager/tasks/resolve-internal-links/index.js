import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Matches: <!--[[LINK: slug | anchor text]]-->
// Group 1 = slug, Group 2 = anchor text
const LINK_PLACEHOLDER_RE = /<!--\[\[LINK:\s*([^\]|]+?)\s*\|\s*([^\]]+?)\s*\]\]-->/g;

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

    md = md.replace(LINK_PLACEHOLDER_RE, (match, slug, anchor) => {
      slug = slug.trim();
      anchor = anchor.trim();
      if (validSlugs.has(slug)) {
        resolvedCount++;
        return `[${anchor}](/${slug})`;
      } else {
        keptCount++;
        warnings.push(`slug desconhecido: "${slug}" (âncora: "${anchor}")`);
        return match; // mantém o placeholder para revisão manual
      }
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

 *
 * ─── context properties ────────────────────────────────────────────────────
 *   taskName     — string, name of this task
 *   mode         — "manual" | "cron"
 *   executionId  — unique UUID for this run (useful for dynamic artifact names)
 *   inputs       — values declared in task.config.yaml inputs[]
 *                  e.g. context.inputs.topic
 *   env          — env vars declared in task.config.yaml env_vars{}
 *                  e.g. context.env.MY_API_KEY
 *   runPrompt    — async fn — only available when --template was selected (see below)
 *   saveArtifact — fn(name, data) — writes JSON to artifacts/resolve-internal-links/<name>.json
 */
export default async function (context) {
  const { taskName, mode, executionId, runPrompt, saveArtifact } = context;

  console.log(`Task: ${taskName} | Mode: ${mode} | ID: ${executionId}`);

  if (runPrompt) {
    // ── runPrompt(extraVars?) ─────────────────────────────────────────────
    // Renders the prompt template, calls the AI, validates against schema.js,
    // and returns a result object. The template is selected via --template or
    // interactively at runtime.
    //
    // Task inputs (e.g. inputs.topic) are auto-injected as {{topic}} in user.md.
    // Pass extraVars to add/override variables not declared in task inputs:
    //
    //   const result = await runPrompt({ date_today: new Date().toISOString().slice(0, 10) });
    //
    // ── result fields ────────────────────────────────────────────────────────
    //
    //   result.artifact
    //     The validated JSON object defined by schema.js.
    //     Shape depends on your schema — this is the main AI output.
    //
    //   result.citations        (Perplexity/sonar only — [] for OpenAI)
    //     string[] of source URLs the model consulted.
    //     Index is 0-based here; citation markers in the text are 1-based:
    //       [1] in text → citations[0]
    //       [2] in text → citations[1]
    //
    //   result.searchResults    (Perplexity/sonar only — [] for OpenAI)
    //     Rich metadata for each source, aligned 1:1 with citations[].
    //     Each entry: { title, url, snippet, date, last_updated, source }
    //     Use this when you want to show source cards (title + snippet)
    //     instead of bare URLs.
    //
    //   result.usage            (Perplexity/sonar only — basic tokens for OpenAI)
    //     Token counts + cost breakdown.
    //     Key fields:
    //       usage.prompt_tokens      — input tokens consumed
    //       usage.completion_tokens  — output tokens generated
    //       usage.cost.total_cost    — total cost in USD (Perplexity only)
    //       usage.cost.search_queries_cost — cost of web searches (Perplexity only)
    //
    //   result.model    — model string used (e.g. "sonar-pro", "gpt-4o")
    //   result.template — template name used for this call
    //
    // ── Usage examples ───────────────────────────────────────────────────────
    //
    // Basic — just the schema output:
    //   const { artifact } = await runPrompt();
    //   console.log(artifact.title);
    //
    // With Perplexity source metadata:
    //   const { artifact, citations, searchResults, usage } = await runPrompt();
    //   console.log(citations[0]);                    // first source URL
    //   console.log(searchResults[0].title);          // first source title
    //   console.log(searchResults[0].snippet);        // first source excerpt
    //   console.log(usage?.cost?.total_cost);         // cost in USD
    //
    // With extra variables passed at call time:
    //   const { artifact } = await runPrompt({ date_today: new Date().toISOString().slice(0, 10) });

    const { artifact, citations, searchResults, usage } = await runPrompt();

    // ── Manipulate before saving (optional) ──────────────────────────────
    // You have full control — transform, enrich, filter before persisting.
    //
    // Add runtime metadata:
    //   const enriched = { ...artifact, generated_at: new Date().toISOString() };
    //   await saveArtifact("result", enriched);
    //
    // Dynamic filename from artifact field:
    //   const slug = artifact.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
    //   await saveArtifact(`article-${slug}`, artifact);
    //
    // Save multiple artifacts from one run:
    //   await saveArtifact("summary", { title: artifact.title, tags: artifact.tags });
    //   await saveArtifact("full", artifact);
    //
    // Save source metadata alongside the artifact (useful for Perplexity tasks):
    //   await saveArtifact("result", artifact);
    //   if (searchResults.length) await saveArtifact("sources", searchResults);
    //
    // Skip saving — just send to an external API:
    //   await sendToExternalApi(artifact);

    // Default: save as declared in task.config.yaml artifacts[]
    await saveArtifact("result", artifact);

    if (usage?.cost?.total_cost != null) {
      console.log(`Cost: $${usage.cost.total_cost.toFixed(6)} USD`);
    }

    console.log("Done!");
  }
}
