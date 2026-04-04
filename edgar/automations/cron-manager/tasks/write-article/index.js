import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Task: write-article
 *
 * This is the entry point for your task. It receives a `context` object with
 * everything you need: inputs, env vars, AI prompt runner, and artifact saving.
 *
 * context properties:
 *   taskName    — string, name of this task
 *   mode        — "manual" | "cron"
 *   executionId — unique UUID for this run (useful for dynamic artifact names)
 *   inputs      — object with values declared in task.config.yaml inputs[]
 *   env         — object with env vars declared in task.config.yaml env_vars{}
 *   runPrompt   — async fn (see below) — only available when --template was selected
 *   saveArtifact — fn(name, data) — saves data as JSON to artifacts/write-article/<name>.json
 */
export default async function (context) {
  const { taskName, mode, executionId, runPrompt, saveArtifact, inputs } = context;

  console.log(`Task: ${taskName} | Mode: ${mode} | ID: ${executionId}`);
  console.log("Inputs:", JSON.stringify(inputs, null, 2));

  if (!runPrompt) {
    throw new Error("runPrompt não disponível. Execute com --template searchable-ai");
  }

  // Passa todos os inputs obrigatórios para o prompt
  const { artifact, model } = await runPrompt({
    ...inputs,
    date_today: new Date().toISOString().slice(0, 10),
  });

  console.log("--- Artigo gerado ---");
  console.log(`Título: ${artifact.title}`);
  console.log(`Slug: ${artifact.slug}`);
  console.log(`SEO Meta: ${artifact.seoMetaDescription}`);
  console.log(`Palavras-chave: ${artifact.keywords.join(", ")}`);
  console.log("--- Trecho do markdown ---");
  console.log(artifact.markdownText.slice(0, 400) + (artifact.markdownText.length > 400 ? "..." : ""));




  // Salva como artifact principal
  await saveArtifact("result", artifact);
  // Salva também como arquivo dinâmico por slug
  await saveArtifact(`article-${artifact.slug}`, artifact);

  // Salva o markdownText como arquivo .md real (com \n convertidos em quebras de linha)
  const articlesDir = path.join(__dirname, "..", "..", "artifacts", "write-article");
  fs.mkdirSync(articlesDir, { recursive: true });
  const mdPath = path.join(articlesDir, `${artifact.slug}.md`);
  fs.writeFileSync(mdPath, artifact.markdownText.replace(/\\n/g, "\n"), "utf8");
  console.log(`Markdown saved: artifacts/write-article/${artifact.slug}.md`);

  console.log(`\nModel used: ${model}`);
  console.log("Done!");
}
