/** Today's date as YYYY-MM-DD (local-equivalent UTC slice, matching existing tasks). */
export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/** A date N days before today, as YYYY-MM-DD. */
export function daysAgoStr(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Resolve an upstream artifact path that embeds a {date}, tolerating the
 * midnight boundary: try today first, then fall back to yesterday.
 *
 * Stages run as separate cron jobs, so a fetcher run at 23:59 and a picker run
 * at 00:01 would otherwise look for different {date} files and silently miss
 * each other. This returns the first path that exists.
 *
 * @param {(date: string) => string} buildPath  builds the full path for a given YYYY-MM-DD
 * @param {(p: string) => boolean} exists        existence check (fs.existsSync or similar)
 * @returns {{ path: string, date: string, found: boolean }}
 */
export function resolveDatedPath(buildPath, exists) {
  const today = todayStr();
  const todayPath = buildPath(today);
  if (exists(todayPath)) {
    return { path: todayPath, date: today, found: true };
  }
  const yesterday = daysAgoStr(1);
  const yPath = buildPath(yesterday);
  if (exists(yPath)) {
    return { path: yPath, date: yesterday, found: true };
  }
  // Nothing found — return today's path so callers can report it.
  return { path: todayPath, date: today, found: false };
}
