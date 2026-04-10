import fs from "fs/promises";
import path from "path";

/**
 * publish-article task
 *
 * Picks the oldest unpublished article from articles_dir, posts it to the
 * blog API, then moves the files to a published/ subfolder.
 * Rotates destinations round-robin across executions using a state file.
 * Cleans up published files older than 7 days automatically.
 *
 * Inputs:
 *   articles_dir  - path to folder containing generated article *.json/*.md files (required)
 *   destinations  - array of { business_id, blog_topic_slug } objects (required)
 *
 * Env vars:
 *   API_KEY (or X_API_KEY or x-api-key) - API key for the blog endpoint
 *
 * State file:
 *   {articles_dir}/publish-article.last.json — persists round-robin index
 *
 * Endpoint:
 *   POST http://localhost:3900/blog-article
 */
export default async function (context) {
  const { taskName, mode, executionId, inputs, env } = context;

  console.log(`Task: ${taskName} | Mode: ${mode} | ID: ${executionId}`);

  // ── 1. Validate inputs ───────────────────────────────────────────────────
  const { articles_dir: articlesDir, destinations } = inputs;

  if (!articlesDir) {
    throw new Error("Missing required input: articles_dir");
  }
  if (!Array.isArray(destinations) || destinations.length === 0) {
    throw new Error("Missing required input: destinations (must be a non-empty array)");
  }

  // ── 2. Find oldest unpublished JSON article ───────────────────────────────
  const allFiles = await fs.readdir(articlesDir);
  const jsonFiles = allFiles.filter(
    (f) => f.endsWith(".json") && f !== "publish-article.last.json",
  );

  if (jsonFiles.length === 0) {
    console.log("No .json articles found. Nothing to publish. Exiting.");
    return;
  }

  const oldest = await findOldest(articlesDir, jsonFiles);
  const slug = oldest.replace(/\.json$/, "");

  console.log(`\nSelected article: ${slug}`);

  // ── 3. Load JSON and Markdown ─────────────────────────────────────────────
  const jsonPath = path.join(articlesDir, `${slug}.json`);
  const mdPath = path.join(articlesDir, `${slug}.md`);

  const json = await readJson(jsonPath);
  if (!json) {
    console.error(`Failed to parse JSON: ${jsonPath}. Skipping.`);
    return;
  }

  // Prefer .md file over markdownText in JSON — respects manual edits
  const contentMd = (await readFileSafe(mdPath)) ?? json.markdownText ?? "";

  // ── 4. Validate required fields ───────────────────────────────────────────
  const missingFields = ["title", "seoMetaDescription", "slug"].filter((f) => !json[f]);
  if (missingFields.length > 0) {
    console.error(`Missing required fields in JSON: ${missingFields.join(", ")}. Skipping.`);
    return;
  }

  // ── 5. Resolve destination via round-robin ────────────────────────────────
  const statePath = path.join(articlesDir, "publish-article.last.json");
  const lastIdx = await readLastIdx(statePath);
  const nextIdx = (lastIdx + 1) % destinations.length;
  const destination = destinations[nextIdx];

  console.log(
    `Destination: business_id=${destination.business_id} | blog_topic_slug=${destination.blog_topic_slug}`,
  );

  // Persist new index before POST — avoids re-sending to same dest on failure
  await fs.writeFile(statePath, JSON.stringify({ lastIdx: nextIdx }, null, 2));

  // ── 6. Build and send payload ─────────────────────────────────────────────
  const payload = {
    business_id: destination.business_id,
    blog_topic_slug: destination.blog_topic_slug,
    title: json.title,
    seo_description: json.seoMetaDescription,
    content_md: contentMd,
    faq_json: json.faq_json ?? [],
    type: "public",
    slug: json.slug ?? slug,
    published: json.published ?? new Date().toISOString(),
  };

  console.log(`\nPosting: "${payload.title}"`);

  const apiKey = env.API_KEY ?? env.X_API_KEY ?? env["x-api-key"] ?? "";
  const success = await postArticle(payload, apiKey);

  if (!success) {
    console.error("POST failed. Article will not be moved to published/.");
    return;
  }

  console.log("Published successfully!");

  // ── 7. Move files to published/ ───────────────────────────────────────────
  const publishedDir = path.join(articlesDir, "published");
  await fs.mkdir(publishedDir, { recursive: true });

  const today = new Date().toISOString().slice(0, 10);
  await fs.rename(jsonPath, path.join(publishedDir, `${slug}-${today}.json`));

  if (await fileExists(mdPath)) {
    await fs.rename(mdPath, path.join(publishedDir, `${slug}-${today}.md`));
  }

  console.log(`Moved to published/${slug}-${today}.[json|md]`);

  // ── 8. Clean up published files older than 7 days ────────────────────────
  await cleanOldFiles(publishedDir, 7);

  console.log("\n✅ Done!");
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the filename of the oldest file (by mtime) in the given list.
 */
async function findOldest(dir, files) {
  let oldest = null;
  let oldestMtime = Infinity;

  for (const file of files) {
    const stat = await fs.stat(path.join(dir, file));
    if (stat.mtimeMs < oldestMtime) {
      oldest = file;
      oldestMtime = stat.mtimeMs;
    }
  }

  return oldest;
}

/**
 * Reads and parses a JSON file. Returns null on error.
 */
async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Reads a file safely. Returns null if file does not exist or cannot be read.
 */
async function readFileSafe(filePath) {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Returns true if a file exists.
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads the last round-robin index from the state file.
 * Returns -1 if the file does not exist or cannot be parsed.
 */
async function readLastIdx(statePath) {
  try {
    const state = JSON.parse(await fs.readFile(statePath, "utf-8"));
    return typeof state.lastIdx === "number" ? state.lastIdx : -1;
  } catch {
    return -1;
  }
}

/**
 * POSTs the article payload to the blog API.
 * Returns true on success, false on failure.
 */
async function postArticle(payload, apiKey) {
  try {
    const { default: fetch } = await import("node-fetch");
    const res = await fetch("http://localhost:3900/blog-article", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`POST failed: ${res.status} ${body}`);
      return false;
    }

    return true;
  } catch (err) {
    console.error(`POST error: ${err.message}`);
    return false;
  }
}

/**
 * Deletes files in the given directory that are older than `days` days.
 */
async function cleanOldFiles(dir, days) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const files = await fs.readdir(dir);
  let removed = 0;

  for (const file of files) {
    const filePath = path.join(dir, file);
    try {
      const stat = await fs.stat(filePath);
      if (stat.mtimeMs < cutoff) {
        await fs.unlink(filePath);
        removed++;
        console.log(`Cleaned up: ${file}`);
      }
    } catch {
      // skip files that cannot be stat'd or deleted
    }
  }

  if (removed === 0) {
    console.log("No old files to clean up.");
  }
}
