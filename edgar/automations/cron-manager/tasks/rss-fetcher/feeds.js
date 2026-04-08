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
  // ── Portuguese / Brazilian sources ──────────────────────────────────────
  // {
  //   url: "https://g1.globo.com/rss/g1/",
  //   name: "G1 - Globo",
  //   lang: "pt",
  //   category: "general",
  // },
  // {
  //   url: "https://feeds.folha.uol.com.br/folha/mundo/rss091.xml",
  //   name: "Folha de S.Paulo - Mundo",
  //   lang: "pt",
  //   category: "general",
  // },
  // {
  //   url: "https://www.uol.com.br/rss.xml",
  //   name: "UOL Notícias",
  //   lang: "pt",
  //   category: "general",
  // },
  // {
  //   url: "https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml",
  //   name: "Agência Brasil",
  //   lang: "pt",
  //   category: "general",
  // },
  // {
  //   url: "https://tecnoblog.net/feed/",
  //   name: "Tecnoblog",
  //   lang: "pt",
  //   category: "technology",
  // },
  // {
  //   url: "https://www.infomoney.com.br/feed/",
  //   name: "InfoMoney",
  //   lang: "pt",
  //   category: "finance",
  // },
  // {
  //   url: "https://exame.com/feed/",
  //   name: "Exame",
  //   lang: "pt",
  //   category: "business",
  // },
  // {
  //   url: "https://olhardigital.com.br/feed/",
  //   name: "Olhar Digital",
  //   lang: "pt",
  //   category: "technology",
  // },

  // ── English sources ──────────────────────────────────────────────────────
  // {
  //   url: "https://feeds.bbci.co.uk/news/rss.xml",
  //   name: "BBC News",
  //   lang: "en",
  //   category: "general",
  // },
  // {
  //   url: "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml",
  //   name: "New York Times",
  //   lang: "en",
  //   category: "general",
  // },
  // {
  //   url: "https://feeds.reuters.com/reuters/topNews",
  //   name: "Reuters",
  //   lang: "en",
  //   category: "general",
  // },
  // {
  //   url: "https://techcrunch.com/feed/",
  //   name: "TechCrunch",
  //   lang: "en",
  //   category: "technology",
  // },
  // {
  //   url: "https://www.theverge.com/rss/index.xml",
  //   name: "The Verge",
  //   lang: "en",
  //   category: "technology",
  // },
  // {
  //   url: "https://feeds.hnrss.org/frontpage",
  //   name: "Hacker News",
  //   lang: "en",
  //   category: "technology",
  // },
  {
    url: "https://reportermaceio.com.br/feed/",
    name: "Reporter Maceió",
    lang: "pt",
    category: "general",
  },

  {
    url: "https://www.google.com.br/alerts/feeds/03835077985665690492/8012858652021800071",
    name: "Google Alerts - \"Visto Americano\"",
    lang: "pt",
    category: "general",
  },

  {
    url: "https://www.google.com.br/alerts/feeds/03835077985665690492/8031528910034386881",
    name: "Google Alerts - Visto Americano",
    lang: "pt",
    category: "general",
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
