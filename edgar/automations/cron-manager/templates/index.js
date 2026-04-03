/**
 * Task: {{NAME}}
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
 *   saveArtifact — fn(name, data) — saves data as JSON to artifacts/{{NAME}}/<name>.json
 */
export default async function (context) {
  const { taskName, mode, executionId, runPrompt, saveArtifact } = context;

  // inputs  — values declared in task.config.yaml inputs[]  (e.g. context.inputs.topic)
  // env     — env vars declared in task.config.yaml env_vars{} (e.g. context.env.MY_API_KEY)

  console.log(`Task: ${taskName} | Mode: ${mode} | ID: ${executionId}`);

  // ── Your logic here ───────────────────────────────────────────────────────
  // ── Using a prompt template (optional) ───────────────────────────────────
  // runPrompt() sends the rendered prompt to the AI and returns the structured
  // artifact defined in prompt_templates/<template>/schema.js.
  //
  // The template is selected via --template flag or interactively at runtime.
  // Task inputs (e.g. inputs.topic) are automatically available as {{topic}}
  // in user.md — no need to pass them explicitly.
  //
  // You can also pass extra variables not in task inputs:
  //   const { artifact } = await runPrompt({ date_today: new Date().toISOString() });
  //
  // artifact shape is defined by schema.js in the selected template.
  // result also contains: template (name), model (string), usage (null).

  if (runPrompt) {
    const { artifact } = await runPrompt();

    // ── Manipulate before saving (optional) ────────────────────────────────
    // You have full control — transform, enrich, filter before persisting.
    //
    // Example: add metadata
    // const enriched = { ...artifact, generated_at: new Date().toISOString() };
    //
    // Example: dynamic filename from artifact field (for tasks that produce
    // many files, one per run — e.g. blog articles named after their title):
    // const slug = artifact.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
    // await saveArtifact(`article-${slug}`, artifact);
    //
    // Example: save multiple artifacts from one run
    // await saveArtifact("summary", { title: artifact.title, tags: artifact.tags });
    // await saveArtifact("full", artifact);
    //
    // Example: don't save at all — just send to an API
    // await sendToExternalApi(artifact);

    // Default: save as declared in task.config.yaml artifacts[]
    await saveArtifact("result", artifact);

    console.log("Done!");
  }
}
