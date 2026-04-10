import fs from "fs";
import path from "path";
import { enrichArticle } from "./article-enricher.js";

/**
 * write-article task
 *
 * Reads from an RSS-picked articles list file (JSON format), maintains an index
 * of which article was last processed, and generates an article from the next item
 * in the list using Perplexity Sonar Pro for web research.
 *
 * Inputs:
 *   rss_picker_file_pattern      - pattern with [aaaa-mm-dd] placeholder (e.g. 'approved-visto-americano-[aaaa-mm-dd].json')
 *   current_approved_list_path   - directory where the list file is stored
 *   language                     - output language, e.g. pt-BR, en-US (default: pt-BR)
 *   blog_context                 - description of your blog and audience (optional)
 *
 * Behavior:
 *   1. Constructs the filename by replacing [aaaa-mm-dd] with today's date (YYYY-MM-DD)
 *   2. Reads the approved articles list from <current_approved_list_path>/<filename>
 *   3. Checks for an index file (same name without .json extension)
 *   4. If index exists, reads current position; otherwise starts at 0
 *   5. Picks the article at that position, increments index, saves it back
 *   6. Uses the article's title and link to write the blog post
 *
 * Template:
 *   news — uses Perplexity sonar-pro with web search to research and write
 *
 * Artifact output:
 *   artifacts/write-article/{slug}.json  — structured data
 *   artifacts/write-article/{slug}.md    — raw markdown file
 */
export default async function (context) {
  const { taskName, mode, executionId, inputs, runPrompt, saveArtifact } = context;

  console.log(`Task: ${taskName} | Mode: ${mode} | ID: ${executionId}`);

  // ─── Resolve file path with date pattern ──────────────────────────────────
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const pattern = inputs.rss_picker_file_pattern;
  const resolvedFilename = pattern.replace("[aaaa-mm-dd]", today);
  const listPath = path.join(inputs.current_approved_list_path, resolvedFilename);
  const indexPath = path.join(inputs.current_approved_list_path, resolvedFilename.replace(/\.json$/, ""));

  console.log(`\nResolving approved articles list:`);
  console.log(`  Pattern:     ${pattern}`);
  console.log(`  Date:        ${today}`);
  console.log(`  List file:   ${listPath}`);
  console.log(`  Index file:  ${indexPath}`);

  // ─── Read approved articles list ───────────────────────────────────────────
  if (!fs.existsSync(listPath)) {
    throw new Error(`Articles list not found: ${listPath}`);
  }

  let articles;
  try {
    const content = fs.readFileSync(listPath, "utf8");
    const parsed = JSON.parse(content);
    
    // Support both formats:
    // 1. Direct array: [{ title, link }, ...]
    // 2. rss-picker format: { topic, items: [{ title, link }, ...] }
    if (Array.isArray(parsed)) {
      articles = parsed;
    } else if (parsed && Array.isArray(parsed.items)) {
      articles = parsed.items;
    } else {
      throw new Error("Expected articles to be an array or object with 'items' array");
    }
  } catch (err) {
    throw new Error(`Failed to parse articles list: ${err.message}`);
  }

  console.log(`  Articles in list: ${articles.length}`);

  // ─── Read or initialize index ───────────────────────────────────────────────
  let currentIndex = 0;
  if (fs.existsSync(indexPath)) {
    try {
      const indexContent = fs.readFileSync(indexPath, "utf8").trim();
      currentIndex = parseInt(indexContent, 10);
      if (isNaN(currentIndex)) {
        currentIndex = 0;
      }
    } catch (err) {
      console.warn(`Warning: Failed to read index file, starting at 0: ${err.message}`);
      currentIndex = 0;
    }
  }

  console.log(`  Current index: ${currentIndex}`);

  // ─── Get article at current index ──────────────────────────────────────────
  if (currentIndex >= articles.length) {
    throw new Error(`Index ${currentIndex} is out of bounds (list has ${articles.length} articles)`);
  }

  const article = articles[currentIndex];
  if (!article.title || !article.link) {
    throw new Error(`Article at index ${currentIndex} is missing 'title' or 'link' field`);
  }

  console.log(`\n✓ Article selected from list:`);
  console.log(`  Index: ${currentIndex}`);
  console.log(`  Title: ${article.title}`);
  console.log(`  Link:  ${article.link}`);

  // ─── Lock next position BEFORE generating (simple and safe) ─────────────────
  // if index update fails, abort (cron will retry with same article)
  // if generation fails AFTER index update, it's acceptable (index is safe)
  const nextIndex = currentIndex + 1;
  
  if (nextIndex <= articles.length) {
    try {
      fs.writeFileSync(indexPath, nextIndex.toString(), "utf8");
      console.log(`\n📊 Index locked: ${currentIndex} → ${nextIndex}`);
    } catch (err) {
      throw new Error(`Failed to lock index (aborting): ${err.message}`);
    }
  }

  // ─── Prepare inputs for prompt template ────────────────────────────────────
  const promptInputs = {
    title: article.title,
    link: article.link,
    language: inputs.language,
    blog_context: inputs.blog_context,
    date_today: today,
  };

  console.log(`\n📝 Generating article content...`);

  const {
    artifact,
    model,
    citations = [],
    searchResults = [],
    usage = {},
  } = await runPrompt(promptInputs);

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
    reference_title: article.title,
    reference_link: article.link,
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

  console.log(`\n📁 Artifacts saved:`);
  console.log(`   JSON:       artifacts/write-article/${artifactName}.json`);
  console.log(`   Markdown:   artifacts/write-article/${artifact.slug}.md`);

  // ─── Final summary ────────────────────────────────────────────────────────
  console.log("\n─────────────────────────────────────────────────────────");
  console.log(`✅ Task completed successfully!`);
  console.log(`   Articles processed: ${nextIndex} / ${articles.length}`);
}
