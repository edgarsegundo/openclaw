/**
 * google-indexing.js
 *
 * Handles two indexing actions after an article is published:
 *   1. Sitemap ping — GET https://www.google.com/ping?sitemap=<url>
 *   2. Google Indexing API — POST urlNotifications:publish
 *
 * Both actions use retry logic and log results independently.
 * Failure in one does not block the other.
 */

/**
 * Ping Google with the sitemap URL.
 * Retries up to 2 times with exponential backoff (1s, 2s).
 *
 * @param {string} sitemapUrl
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function pingSitemap(sitemapUrl) {
  const pingUrl = `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`;
  const MAX_RETRIES = 2;
  const TIMEOUT_MS = 5000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const res = await fetch(pingUrl, { signal: controller.signal });
      clearTimeout(timer);

      if (res.ok) {
        console.log(`[Sitemap Ping] ✅ Success (attempt ${attempt}): ${pingUrl}`);
        return { ok: true };
      }

      const body = await res.text();
      console.warn(`[Sitemap Ping] ⚠️  HTTP ${res.status} (attempt ${attempt}): ${body}`);
    } catch (err) {
      console.warn(`[Sitemap Ping] ⚠️  Error (attempt ${attempt}): ${err.message}`);
    }

    if (attempt < MAX_RETRIES) {
      const waitMs = attempt * 1000;
      console.log(`[Sitemap Ping] Retrying in ${waitMs}ms...`);
      await sleep(waitMs);
    }
  }

  const error = `Failed after ${MAX_RETRIES} attempt(s)`;
  console.error(`[Sitemap Ping] ❌ ${error}`);
  return { ok: false, error };
}

/**
 * Submit a URL to the Google Indexing API.
 * Requires GOOGLE_APPLICATION_CREDENTIALS env var pointing to a Service Account JSON.
 * Retries up to 2 times per URL.
 *
 * @param {string} articleUrl — full URL of the published article
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function submitToIndexingApi(articleUrl) {
  const MAX_RETRIES = 2;

  let auth;
  try {
    const { google } = await import("googleapis");
    auth = new google.auth.GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/indexing"],
    });
  } catch (err) {
    const error = `Failed to initialize Google Auth: ${err.message}`;
    console.error(`[Indexing API] ❌ ${error}`);
    return { ok: false, error };
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const client = await auth.getClient();
      const token = await client.getAccessToken();

      const res = await fetch(
        "https://indexing.googleapis.com/v3/urlNotifications:publish",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token.token}`,
          },
          body: JSON.stringify({ url: articleUrl, type: "URL_UPDATED" }),
        }
      );

      if (res.ok) {
        console.log(`[Indexing API] ✅ Submitted (attempt ${attempt}): ${articleUrl}`);
        return { ok: true };
      }

      const data = await res.json().catch(() => ({}));
      console.warn(
        `[Indexing API] ⚠️  HTTP ${res.status} (attempt ${attempt}):`,
        JSON.stringify(data)
      );
    } catch (err) {
      console.warn(`[Indexing API] ⚠️  Error (attempt ${attempt}): ${err.message}`);
    }

    if (attempt < MAX_RETRIES) {
      const waitMs = attempt * 1000;
      console.log(`[Indexing API] Retrying in ${waitMs}ms...`);
      await sleep(waitMs);
    }
  }

  const error = `Failed after ${MAX_RETRIES} attempt(s)`;
  console.error(`[Indexing API] ❌ ${error}`);
  return { ok: false, error };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
