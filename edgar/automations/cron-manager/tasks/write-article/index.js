import fs from "fs";
import path from "path";
import { enrichArticle } from "./article-enricher.js";

/**
 * write-article task
 *
 * Receives a news title and reference link, calls Sonar Pro (Perplexity)
 * to research the topic on the web and write a completely original article.
 * Saves the article as a Markdown file and a structured JSON artifact.
 *
 * Inputs:
 *   title        - news title to base the article on (required)
 *   link         - reference article URL (required)
 *   language     - output language, e.g. pt-BR, en-US (default: pt-BR)
 *   blog_context - description of your blog and audience (optional)
 *
 * Template:
 *   news — uses Perplexity sonar-pro with web search to research and write
 *
 * Artifact output:
 *   artifacts/write-article/article-{slug}-{today}.json  — structured data
 *   artifacts/write-article/article-{slug}-{today}.md    — raw markdown file
 */
export default async function (context) {
  // ─── context properties ────────────────────────────────────────────────────
  //   taskName     — string, name of this task
  //   mode         — "manual" | "cron"
  //   executionId  — unique UUID for this run (useful for dynamic artifact names)
  //   inputs       — values declared in task.config.yaml inputs[]
  //   env          — env vars declared in task.config.yaml env_vars{}
  //   runPrompt    — async fn — renders template, calls AI, validates via schema.js
  //   saveArtifact — fn(name, data) — writes JSON to artifacts/write-article/<n>.json
  const { taskName, mode, executionId, inputs, runPrompt, saveArtifact } = context;

  console.log(`Task: ${taskName} | Mode: ${mode} | ID: ${executionId}`);

  // ── runPrompt() ───────────────────────────────────────────────────────────
  // Task inputs auto-injected: title, link, language, blog_context
  //
  // result.artifact      — validated JSON: { title, slug, language, seoMetaDescription, markdownText, imageHints }
  // result.citations     — source URLs consulted by Sonar Pro
  // result.searchResults — rich metadata for each source
  // result.usage         — token counts and cost breakdown

  console.log(`\nWriting article for: "${inputs.title}"`);
  console.log(`Reference:           ${inputs.link}`);
  console.log(`Language:            ${inputs.language}`);

  // const { artifact, citations, usage } = await runPrompt();

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

  // ── Print summary ─────────────────────────────────────────────────────────
  const wordCount = (artifact.markdownText ?? "").split(/\s+/).length;

  console.log("\n─── Article Generated ───────────────────────────────────");
  console.log(`Title:       ${artifact.title}`);
  console.log(`Slug:        ${artifact.slug}`);
  console.log(`Language:    ${artifact.language}`);
  console.log(`Words:       ~${wordCount}`);
  console.log(`SEO desc:    ${artifact.seoMetaDescription}`);
  console.log(
    `Image hints: ${artifact.imageHints?.searchQueries?.join(" | ") ?? "-"}`
  );

  if (citations?.length > 0) {
    console.log(`Sources:     ${citations.length} web source(s) consulted`);
    citations.forEach((url, i) => console.log(`  [${i + 1}] ${url}`));
  }

  if (usage?.cost?.total_cost != null) {
    console.log(`Cost:        $${usage.cost.total_cost.toFixed(6)} USD`);
  }

  // ── Save JSON artifact ────────────────────────────────────────────────────
  const artifactName = `${artifact.slug}`;
  const generatedAt = new Date().toISOString();

  // await saveArtifact(`${artifactName}-raw`, {
  //   title: artifact.title,
  //   slug: artifact.slug,
  //   language: artifact.language,
  //   seoMetaDescription: artifact.seoMetaDescription,
  //   imageHints: artifact.imageHints,
  //   reference_title: inputs.title,
  //   reference_link: inputs.link,
  //   generated_at: generatedAt,
  //   word_count: wordCount,
  //   sources: citations || [],
  //   searchResults: searchResults || [],
  //   usage: usage || {},
  //   markdownText: artifact.markdownText,
  // });

  // Enriquece o artigo com todas as transformações
  const { enrichedMarkdown, enrichedArtifact } = enrichArticle({
    artifact,
    citations,
    searchResults,
    usage,
  });

  // ── Save JSON artifact (ENRICHED) ───────────────────────────────────────────
  await saveArtifact(artifactName, {
    ...enrichedArtifact,
    reference_title: inputs.title,
    reference_link: inputs.link,
    generated_at: generatedAt,
    word_count: wordCount,
  });

  // ── Save Markdown final ─────────────────────────────────────────────────────
  const markdownDir = path.resolve("artifacts/write-article");
  fs.mkdirSync(markdownDir, { recursive: true });

  const finalMarkdown = enrichedMarkdown.includes("\\n")
    ? enrichedMarkdown.replace(/\\n/g, "\n")
    : enrichedMarkdown;
  const mdPath = path.join(markdownDir, `${artifact.slug}.md`);
  fs.writeFileSync(mdPath, finalMarkdown, "utf8");

  console.log(`Markdown saved: artifacts/write-article/${artifact.slug}.md`);

  // ── Final summary ───────────────────────────────────────────────────────────
  console.log("\n─────────────────────────────────────────────────────────");
  console.log(`✅ Done!`);
  console.log(`   RAW JSON:  artifacts/write-article/${artifactName}-raw.json`);
  console.log(`   JSON:      artifacts/write-article/${artifactName}.json`);
  console.log(`   Markdown:  artifacts/write-article/${artifact.slug}.md`);
}
