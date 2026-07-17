/**
 * feeds.js
 *
 * Default RSS feed list used when no custom feeds are provided via input.
 * Organized by category so it's easy to extend.
 *
 * To add a new feed: just push a new entry to the appropriate category array,
 * or create a new category object.
 *
 * Each feed entry:
 *   url      - RSS feed URL (required)
 *   name     - Human-readable name (required)
 *   lang     - ISO language code: 'pt', 'en', 'es' (required)
 *   category - Category tag for future filtering (required)
 */

export const DEFAULT_FEEDS = [
  {
    url: "https://www.google.com.br/alerts/feeds/03835077985665690492/982633917370908678",
    name: 'Google Alerts - "Disney Orlando"',
    lang: "pt",
    category: "general",
    type: "rss",
  },

  {
    url: "https://g1.globo.com/tudo-sobre/walt-disney-world/",
    name: "G1 - Walt Disney World",
    lang: "pt",
    category: "general",
    type: "scraper",
    scrap_layout_tips: {
      link_selector: "a.feed-post-link",
    },
  },

  {
    url: "https://www.melhoresdestinos.com.br/feed",
    name: "Melhores Destinos",
    lang: "pt",
    category: "general",
    type: "rss",
  },

  {
    url: "https://brasilturis.com.br/category/noticias/atracoes-turisticas/",
    name: "Brasilturis - Atrações Turísticas",
    lang: "pt",
    category: "general",
    type: "scraper",
    scrap_layout_tips: {
      link_selector: "h3.entry-title a",
    },
  },
];

/**
 * Parse a comma-separated string of URLs into a feed entry array.
 * Used when the user passes custom feeds via the `feeds` input.
 *
 * @param {string} feedsString - Comma-separated list of RSS URLs
 * @returns {Array<{url: string, name: string, lang: string, category: string}>}
 */
export function parseCustomFeeds(feedsString) {
  return feedsString
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean)
    .map((url) => ({
      url,
      name: url,
      lang: "unknown",
      category: "custom",
    }));
}
