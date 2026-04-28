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
  {
    url: "https://www.cnnbrasil.com.br/tudo-sobre/educacao/feed/",
    name: "CNN Brasil - Educação",
    lang: "pt",
    category: "education",
    type: "rss",
  },

  {
    url: "https://veja.abril.com.br/noticias-sobre/visto/rss/",
    name: "Veja - Vistos",
    lang: "pt",
    category: "general",
    type: "rss",
  },

  {
    url: "https://www.correiodamanhacanada.com/feed/",
    name: "Correio da Manhã Canada",
    lang: "pt",
    category: "general",
    type: "rss",
  },

  {
    url: "https://g1.globo.com/rss/g1/",
    name: "G1 - Globo",
    lang: "pt",
    category: "general",
    type: "rss",
  },

  {
    url: "https://feeds.folha.uol.com.br/folha/mundo/rss091.xml",
    name: "Folha de S.Paulo - Mundo",
    lang: "pt",
    category: "general",
    type: "rss",
  },

  {
    url: "https://www.uol.com.br/rss.xml",
    name: "UOL Notícias",
    lang: "pt",
    category: "general",
    type: "rss",
  },

  {
    url: "https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml",
    name: "Agência Brasil",
    lang: "pt",
    category: "general",
    type: "rss",
  },

  {
    url: "https://exame.com/feed/",
    name: "Exame",
    lang: "pt",
    category: "business",
    type: "rss",
  },

  {
    url: "https://reportermaceio.com.br/feed/",
    name: "Reporter Maceió",
    lang: "pt",
    category: "general",
    type: "rss",
  },

  {
    url: "https://www.google.com.br/alerts/feeds/03835077985665690492/8012858652021800071",
    name: 'Google Alerts - "Visto Americano"',
    lang: "pt",
    category: "general",
    type: "rss",
  },

  {
    url: "https://www.google.com.br/alerts/feeds/03835077985665690492/8031528910034386881",
    name: "Google Alerts - Visto Americano",
    lang: "pt",
    category: "general",
    type: "rss",
  },
  {
    url: "https://www.google.com.br/alerts/feeds/03835077985665690492/14805574443330081222",
    name: 'Google Alerts - "Visto Canadá"',
    lang: "pt",
    category: "general",
    type: "rss",
  },

  {
    url: "https://www.google.com.br/alerts/feeds/03835077985665690492/5047037072991100066",
    name: 'Google Alerts - "Visto Canadense"',
    lang: "pt",
    category: "general",
    type: "rss",
  },

  {
    url: "https://www.google.com.br/alerts/feeds/03835077985665690492/10072337624775444540",
    name: 'Google Alerts - "Visto Mexicano"',
    lang: "pt",
    category: "general",
    type: "rss",
  },

  {
    url: "https://diariodocomercio.com.br/feed/",
    name: "Diário do Comércio",
    lang: "pt",
    category: "business",
    type: "rss",
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
