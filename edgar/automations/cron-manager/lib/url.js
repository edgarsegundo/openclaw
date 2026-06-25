import crypto from "crypto";

/**
 * Unwrap a feed link to the underlying article URL.
 *
 * Google Alerts (and similar) wrap the real destination in a `?url=` query
 * param. We unwrap that so the same article fetched from different feeds maps
 * to one identity. Non-wrapped links are returned untouched.
 */
export function extractRealUrl(link) {
  try {
    const parsed = new URL(link);
    const realUrl = parsed.searchParams.get("url");
    return realUrl ? decodeURIComponent(realUrl) : link;
  } catch {
    return link;
  }
}

/**
 * Stable, short identity for a news item, derived from its real URL.
 *
 * The same article produces the same id in every pipeline stage, which is what
 * lets us correlate fetch → pick → write → publish for a single item.
 */
export function itemIdFromUrl(link) {
  const real = extractRealUrl(link || "");
  return crypto.createHash("sha1").update(real).digest("hex").slice(0, 12);
}
