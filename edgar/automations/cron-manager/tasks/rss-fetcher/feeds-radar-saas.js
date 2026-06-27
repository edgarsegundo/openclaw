/**
 * feeds.js — Radar de Oportunidades de Negócios (foco: SaaS & Startups)
 *
 * Fontes organizadas por categoria:
 *   saas_br      — portais brasileiros de startups e tecnologia
 *   saas_en      — fontes internacionais de startups, SaaS e indie hacking
 *   vc_blogs     — blogs de fundos de Venture Capital
 *   product_hunt — lançamentos de produtos
 *   hacker_news  — Hacker News (melhores e mais recentes)
 *   indie        — indie hackers e bootstrapped founders
 *   alerts_br    — Google Alerts configurados para PT-BR
 *   alerts_en    — Google Alerts configurados para EN
 *
 * IMPORTANTE — Google Alerts:
 *   Substitua os placeholders ALERT_ID_XXXX pelas IDs reais dos seus alertas.
 *   Veja o guia completo no final deste arquivo (seção GOOGLE ALERTS SETUP).
 *
 * Cada entrada:
 *   url      — URL do feed RSS (obrigatório)
 *   name     — Nome legível (obrigatório)
 *   lang     — 'pt' | 'en' | 'es' | 'unknown' (obrigatório)
 *   category — Tag de categoria (obrigatório)
 *   type     — 'rss' | 'scraper' (padrão: 'rss')
 *   notes    — Observação opcional sobre o feed
 */

export const DEFAULT_FEEDS = [
  // ─────────────────────────────────────────────────────────────────────────
  // CATEGORIA: saas_br — Fontes brasileiras de startups, SaaS e negócios
  // ─────────────────────────────────────────────────────────────────────────

  {
    url: "https://startups.com.br/feed/",
    name: "Startups.com.br",
    lang: "pt",
    category: "saas_br",
    type: "rss",
    notes: "Principal portal brasileiro de startups — histórias de fundação, rodadas, entrevistas",
  },
  {
    url: "https://neofeed.com.br/feed/",
    name: "NeoFeed",
    lang: "pt",
    category: "saas_br",
    type: "rss",
    notes: "Negócios e tecnologia com profundidade — perfil de empresas e founders",
  },
  {
    url: "https://exame.com/feed/",
    name: "Exame",
    lang: "pt",
    category: "saas_br",
    type: "rss",
    notes: "Feed geral da Exame — filtrar pelo scoring de patterns",
  },
  {
    url: "https://exame.com/tecnologia/feed/",
    name: "Exame — Tecnologia",
    lang: "pt",
    category: "saas_br",
    type: "rss",
  },
  {
    url: "https://exame.com/negocios/feed/",
    name: "Exame — Negócios",
    lang: "pt",
    category: "saas_br",
    type: "rss",
  },
  {
    url: "https://forbes.com.br/feed/",
    name: "Forbes Brasil",
    lang: "pt",
    category: "saas_br",
    type: "rss",
    notes: "Perfis de empreendedores, histórias de criação de empresas",
  },
  {
    url: "https://revistapegn.globo.com/feed/",
    name: "Pequenas Empresas & Grandes Negócios",
    lang: "pt",
    category: "saas_br",
    type: "rss",
    notes: "Casos de negócios, empreendedorismo brasileiro — excelente para histórias de origem",
  },
  {
    url: "https://www.startse.com/feed/",
    name: "StartSe",
    lang: "pt",
    category: "saas_br",
    type: "rss",
    notes: "Ecossistema de startups e inovação corporativa no Brasil",
  },
  {
    url: "https://canaltech.com.br/rss/",
    name: "Canaltech",
    lang: "pt",
    category: "saas_br",
    type: "rss",
    notes: "Tecnologia e novos produtos — bom para detectar lançamentos de SaaS BR",
  },
  {
    url: "https://olhardigital.com.br/feed/",
    name: "Olhar Digital",
    lang: "pt",
    category: "saas_br",
    type: "rss",
  },
  {
    url: "https://tecnoblog.net/feed/",
    name: "Tecnoblog",
    lang: "pt",
    category: "saas_br",
    type: "rss",
  },
  {
    url: "https://www.infomoney.com.br/feed/",
    name: "InfoMoney",
    lang: "pt",
    category: "saas_br",
    type: "rss",
    notes: "Fintechs, negócios, rodadas de investimento no Brasil",
  },
  {
    url: "https://braziljournal.com/feed/",
    name: "Brazil Journal",
    lang: "pt",
    category: "saas_br",
    type: "rss",
    notes: "Análises profundas de negócios e movimentos do mercado brasileiro",
  },
  {
    url: "https://www.meioemensagem.com.br/feed/",
    name: "Meio & Mensagem",
    lang: "pt",
    category: "saas_br",
    type: "rss",
    notes: "Marcas, comunicação e inovação — útil para tendências de mercado",
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CATEGORIA: saas_en — Fontes internacionais de startups e SaaS
  // ─────────────────────────────────────────────────────────────────────────

  {
    url: "https://techcrunch.com/feed/",
    name: "TechCrunch",
    lang: "en",
    category: "saas_en",
    type: "rss",
    notes: "Principal fonte de notícias de startups — muitas histórias de origem de empresas",
  },
  {
    url: "https://techcrunch.com/category/startups/feed/",
    name: "TechCrunch — Startups",
    lang: "en",
    category: "saas_en",
    type: "rss",
    notes: "Somente a categoria Startups do TechCrunch — sinal mais preciso",
  },
  {
    url: "https://venturebeat.com/feed/",
    name: "VentureBeat",
    lang: "en",
    category: "saas_en",
    type: "rss",
    notes: "IA, SaaS enterprise e rodadas de investimento",
  },
  {
    url: "https://www.saastr.com/feed/",
    name: "SaaStr",
    lang: "en",
    category: "saas_en",
    type: "rss",
    notes: "Maior comunidade SaaS do mundo — frameworks, casos e métricas reais",
  },
  {
    url: "https://www.forbes.com/innovation/feed2/",
    name: "Forbes — Innovation",
    lang: "en",
    category: "saas_en",
    type: "rss",
  },
  {
    url: "https://www.wired.com/feed/rss",
    name: "Wired",
    lang: "en",
    category: "saas_en",
    type: "rss",
    notes: "Tecnologia com profundidade editorial — bom para tendências emergentes",
  },
  {
    url: "https://feeds.feedburner.com/entrepreneur/latest",
    name: "Entrepreneur",
    lang: "en",
    category: "saas_en",
    type: "rss",
    notes: "Histórias de empreendedores — muito alinhado com 'por que fundei esta empresa'",
  },
  {
    url: "https://www.businessinsider.com/rss",
    name: "Business Insider",
    lang: "en",
    category: "saas_en",
    type: "rss",
  },
  {
    url: "https://www.fastcompany.com/latest/rss",
    name: "Fast Company",
    lang: "en",
    category: "saas_en",
    type: "rss",
    notes: "Inovação e design de produtos — perfis ricos de founders",
  },
  {
    url: "https://www.inc.com/rss.xml",
    name: "Inc. Magazine",
    lang: "en",
    category: "saas_en",
    type: "rss",
    notes: "Clássico para histórias de origem e crescimento de empresas",
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CATEGORIA: vc_blogs — Blogs de Venture Capital (análises de oportunidades)
  // ─────────────────────────────────────────────────────────────────────────

  {
    url: "https://a16z.com/feed/",
    name: "Andreessen Horowitz (a16z)",
    lang: "en",
    category: "vc_blogs",
    type: "rss",
    notes: "Teses de investimento e análises de mercado — gold mine para padrões de oportunidade",
  },
  {
    url: "https://www.sequoiacap.com/feed/",
    name: "Sequoia Capital",
    lang: "en",
    category: "vc_blogs",
    type: "rss",
  },
  {
    url: "https://bothsidesofthetable.com/feed",
    name: "Both Sides of the Table (Mark Suster)",
    lang: "en",
    category: "vc_blogs",
    type: "rss",
    notes: "VC com foco em early-stage — perspectiva de quais problemas merecem empresas",
  },
  {
    url: "https://hunterwalk.com/feed/",
    name: "Hunter Walk (Homebrew VC)",
    lang: "en",
    category: "vc_blogs",
    type: "rss",
  },
  {
    url: "https://cdixon.org/feed",
    name: "Chris Dixon (a16z)",
    lang: "en",
    category: "vc_blogs",
    type: "rss",
    notes: "Ensaios sobre oportunidades tecnológicas emergentes",
  },
  {
    url: "https://avc.com/feed/",
    name: "AVC — Fred Wilson (USV)",
    lang: "en",
    category: "vc_blogs",
    type: "rss",
    notes: "União Square Ventures — visão sobre problemas que valem empresas",
  },
  {
    url: "https://tomtunguz.com/index.xml",
    name: "Tomasz Tunguz (Theory Ventures)",
    lang: "en",
    category: "vc_blogs",
    type: "rss",
    notes: "Análises quantitativas de SaaS — métricas, TAM, oportunidades",
  },
  {
    url: "https://davidcummings.org/feed/",
    name: "David Cummings",
    lang: "en",
    category: "vc_blogs",
    type: "rss",
    notes: "Fundador serial de SaaS — perspectiva prática de criação de produto",
  },
  {
    url: "https://feld.com/feed",
    name: "Brad Feld (Foundry)",
    lang: "en",
    category: "vc_blogs",
    type: "rss",
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CATEGORIA: hacker_news — Hacker News RSS (via hnrss.org)
  // ─────────────────────────────────────────────────────────────────────────

  {
    url: "https://hnrss.org/best",
    name: "Hacker News — Best",
    lang: "en",
    category: "hacker_news",
    type: "rss",
    notes: "Melhores posts — inclui muitos 'Show HN: I built X to solve Y'",
  },
  {
    url: "https://hnrss.org/newest?q=Show+HN",
    name: "Hacker News — Show HN",
    lang: "en",
    category: "hacker_news",
    type: "rss",
    notes: "FUNDAMENTAL: founders mostrando produtos novos com contexto de problema resolvido",
  },
  {
    url: "https://hnrss.org/newest?q=Ask+HN",
    name: "Hacker News — Ask HN",
    lang: "en",
    category: "hacker_news",
    type: "rss",
    notes: "Perguntas sobre problemas reais — ouro para detectar dores de mercado",
  },
  {
    url: "https://hnrss.org/newest?q=SaaS",
    name: "Hacker News — SaaS mentions",
    lang: "en",
    category: "hacker_news",
    type: "rss",
  },
  {
    url: "https://hnrss.org/newest?q=I+built",
    name: "Hacker News — 'I built'",
    lang: "en",
    category: "hacker_news",
    type: "rss",
    notes: "Posts de founders descrevendo o que construíram e por quê",
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CATEGORIA: indie — Indie Hackers e Bootstrapped Founders
  // ─────────────────────────────────────────────────────────────────────────

  {
    url: "https://www.indiehackers.com/feed.rss",
    name: "Indie Hackers",
    lang: "en",
    category: "indie",
    type: "rss",
    notes: "FUNDAMENTAL: founders compartilhando histórias de criação de produto e receita",
  },
  {
    url: "https://thebootstrappedfounder.com/feed/",
    name: "The Bootstrapped Founder",
    lang: "en",
    category: "indie",
    type: "rss",
    notes: "Arvid Kahl — foco em construir SaaS resolvendo problemas reais sem VC",
  },
  {
    url: "https://www.failory.com/feed.rss",
    name: "Failory",
    lang: "en",
    category: "indie",
    type: "rss",
    notes: "Autópsias de startups e histórias de sucesso — contexto rico sobre problema+solução",
  },
  {
    url: "https://microconf.com/feed/",
    name: "MicroConf",
    lang: "en",
    category: "indie",
    type: "rss",
    notes: "Comunidade de SaaS bootstrapped — casos práticos de negócios",
  },
  {
    url: "https://www.swipefiles.com/feed",
    name: "Swipe Files",
    lang: "en",
    category: "indie",
    type: "rss",
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CATEGORIA: product_hunt — Product Hunt (lançamentos de produtos)
  // ─────────────────────────────────────────────────────────────────────────

  {
    url: "https://www.producthunt.com/feed",
    name: "Product Hunt — All Products",
    lang: "en",
    category: "product_hunt",
    type: "rss",
    notes: "Lançamentos diários de produtos — descrição sempre inclui problema que resolve",
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CATEGORIA: alerts_br — Google Alerts PT-BR
  //
  // COMO CONFIGURAR (veja guia completo abaixo):
  //   1. Acesse alerts.google.com
  //   2. Crie o alerta com a query exata listada em cada entrada
  //   3. Clique em "Mostrar opções" → Entregar para: feed RSS
  //   4. Copie a URL do feed gerado
  //   5. Substitua o placeholder na entrada correspondente
  //
  // Formato da URL: https://www.google.com/alerts/feeds/SEU_USER_ID/ALERT_ID
  // ─────────────────────────────────────────────────────────────────────────

  // --- Padrão 1: Fundação da empresa ---
  {
    url: "PLACEHOLDER_ALERT_fundou_startup_pt",
    name: 'Google Alert BR — "fundou uma startup"',
    lang: "pt",
    category: "alerts_br",
    type: "rss",
    notes: 'Query: "fundou uma startup" | Captura: histórias de fundação com contexto de problema',
    alert_query: '"fundou uma startup"',
  },
  {
    url: "PLACEHOLDER_ALERT_criou_empresa_resolver_pt",
    name: 'Google Alert BR — "criou uma empresa para resolver"',
    lang: "pt",
    category: "alerts_br",
    type: "rss",
    notes: "Query: criou empresa para resolver — captura origem de negócios diretamente",
    alert_query: '"criou uma empresa para resolver"',
  },
  {
    url: "PLACEHOLDER_ALERT_startup_criada_resolver_pt",
    name: 'Google Alert BR — "startup criada para resolver"',
    lang: "pt",
    category: "alerts_br",
    type: "rss",
    notes: "Query: startup criada para resolver",
    alert_query: '"startup criada para resolver"',
  },
  {
    url: "PLACEHOLDER_ALERT_empresa_nasceu_pt",
    name: 'Google Alert BR — "empresa nasceu para resolver"',
    lang: "pt",
    category: "alerts_br",
    type: "rss",
    notes: "Query: empresa nasceu para resolver",
    alert_query: '"empresa nasceu para resolver"',
  },
  {
    url: "PLACEHOLDER_ALERT_transformou_problema_pt",
    name: 'Google Alert BR — "transformou um problema em negócio"',
    lang: "pt",
    category: "alerts_br",
    type: "rss",
    notes: "Query: transformou problema negócio",
    alert_query: '"transformou um problema em negócio"',
  },

  // --- Padrão 2: Empreendedor percebeu/identificou ---
  {
    url: "PLACEHOLDER_ALERT_empreendedor_percebeu_pt",
    name: 'Google Alert BR — "empreendedor percebeu que"',
    lang: "pt",
    category: "alerts_br",
    type: "rss",
    notes: "Query: empreendedor percebeu — ponto de virada na história de origem",
    alert_query: '"empreendedor percebeu que"',
  },
  {
    url: "PLACEHOLDER_ALERT_identificou_oportunidade_pt",
    name: 'Google Alert BR — "identificou uma oportunidade"',
    lang: "pt",
    category: "alerts_br",
    type: "rss",
    alert_query: '"identificou uma oportunidade" startup',
  },
  {
    url: "PLACEHOLDER_ALERT_dor_do_mercado_pt",
    name: 'Google Alert BR — "dor do mercado" startup',
    lang: "pt",
    category: "alerts_br",
    type: "rss",
    alert_query: '"dor do mercado" startup',
  },

  // --- Padrão 3: SaaS Brasil específico ---
  {
    url: "PLACEHOLDER_ALERT_saas_brasil_lancamento_pt",
    name: "Google Alert BR — SaaS Brasil lançamento",
    lang: "pt",
    category: "alerts_br",
    type: "rss",
    notes: "Query: SaaS Brasil lançamento",
    alert_query: "SaaS Brasil lançamento startup",
  },
  {
    url: "PLACEHOLDER_ALERT_rodada_seed_brasil_pt",
    name: "Google Alert BR — rodada seed Brasil",
    lang: "pt",
    category: "alerts_br",
    type: "rss",
    notes: "Rodadas seed indicam startups early — busca a história do problema junto",
    alert_query: '"rodada seed" startup Brasil',
  },
  {
    url: "PLACEHOLDER_ALERT_resolveu_problema_saas_pt",
    name: 'Google Alert BR — "resolveu o problema"',
    lang: "pt",
    category: "alerts_br",
    type: "rss",
    alert_query:
      '"resolveu o problema" startup saas site:exame.com OR site:startups.com.br OR site:neofeed.com.br',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CATEGORIA: alerts_en — Google Alerts EN (cobertura global de SaaS)
  //
  // Mesma lógica: substitua PLACEHOLDERs pelas URLs reais após criar os alertas.
  // ─────────────────────────────────────────────────────────────────────────

  // --- Origin stories ---
  {
    url: "PLACEHOLDER_ALERT_founded_company_solve_en",
    name: 'Google Alert EN — "founded the company to solve"',
    lang: "en",
    category: "alerts_en",
    type: "rss",
    notes: "Frase de origem clássica em inglês",
    alert_query: '"founded the company to solve"',
  },
  {
    url: "PLACEHOLDER_ALERT_built_because_problem_en",
    name: 'Google Alert EN — "built it because"',
    lang: "en",
    category: "alerts_en",
    type: "rss",
    alert_query: '"built it because" startup saas',
  },
  {
    url: "PLACEHOLDER_ALERT_scratching_own_itch_en",
    name: 'Google Alert EN — "scratching my own itch"',
    lang: "en",
    category: "alerts_en",
    type: "rss",
    notes: "Expressão canônica de indie hackers para produto que resolve sua própria dor",
    alert_query: '"scratching my own itch" startup',
  },
  {
    url: "PLACEHOLDER_ALERT_noticed_nobody_was_en",
    name: 'Google Alert EN — "noticed that nobody was"',
    lang: "en",
    category: "alerts_en",
    type: "rss",
    alert_query: '"noticed that nobody was" startup founder',
  },
  {
    url: "PLACEHOLDER_ALERT_problem_we_were_solving_en",
    name: 'Google Alert EN — "the problem we were solving"',
    lang: "en",
    category: "alerts_en",
    type: "rss",
    alert_query: '"the problem we were solving" startup',
  },

  // --- Show HN style ---
  {
    url: "PLACEHOLDER_ALERT_show_hn_i_built_en",
    name: 'Google Alert EN — "Show HN: I built"',
    lang: "en",
    category: "alerts_en",
    type: "rss",
    notes: "Captura posts Show HN indexados fora do próprio HN",
    alert_query: '"Show HN" "I built" site:news.ycombinator.com',
  },

  // --- SaaS específico ---
  {
    url: "PLACEHOLDER_ALERT_saas_product_launch_en",
    name: 'Google Alert EN — SaaS "pain point"',
    lang: "en",
    category: "alerts_en",
    type: "rss",
    alert_query: 'SaaS startup "pain point" "we built"',
  },
  {
    url: "PLACEHOLDER_ALERT_founder_story_saas_en",
    name: "Google Alert EN — founder story SaaS",
    lang: "en",
    category: "alerts_en",
    type: "rss",
    alert_query: '"founder story" SaaS startup site:techcrunch.com OR site:venturebeat.com',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// parseCustomFeeds — mantém compatibilidade com o contrato original
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parses a comma-separated list of RSS URLs into feed entries.
 * Used when the user passes custom feeds via the `feeds` task input.
 *
 * @param {string} feedsString - Comma-separated RSS URLs
 * @returns {Array<{url, name, lang, category, type}>}
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
      type: "rss",
    }));
}

// =============================================================================
// GOOGLE ALERTS — GUIA DE CONFIGURAÇÃO
// =============================================================================
//
// PASSO A PASSO PARA CRIAR UM ALERTA E OBTER O FEED RSS:
//
//   1. Acesse: https://alerts.google.com
//   2. Digite a query exata (ex: "empreendedor percebeu que")
//   3. Clique em "Mostrar opções"
//   4. Configure:
//        Frequência:  Assim que acontecer
//        Fontes:      Notícias (para foco em jornais) ou Automático (mais abrangente)
//        Idioma:      Português (para alerts_br) / Inglês (para alerts_en)
//        Região:      Brasil (para alerts_br) / Qualquer região (para alerts_en)
//        Quantidade:  Todos os resultados
//        Entregar para: Feed RSS  ← OBRIGATÓRIO para integração aqui
//   5. Clique em "Criar alerta"
//   6. Em alerts.google.com, clique no ícone de feed (📡) ao lado do alerta criado
//   7. Copie a URL no formato:
//        https://www.google.com/alerts/feeds/SEU_USER_ID/ALERT_ID
//   8. Cole no campo `url` da entrada correspondente neste arquivo,
//      substituindo o PLACEHOLDER_ALERT_xxx
//
// QUERIES PRIORITÁRIAS PARA CRIAR (ordem de impacto esperado):
//
//   PORTUGUÊS (criar primeiro — foco em mercado BR):
//   ┌─────────────────────────────────────────────────────────────────────┐
//   │  "fundou uma startup"                                               │
//   │  "criou uma empresa para resolver"                                  │
//   │  "startup criada para resolver"                                     │
//   │  "empresa nasceu para resolver"                                     │
//   │  "empreendedor percebeu que"                                        │
//   │  "transformou um problema em negócio"                               │
//   │  "dor do mercado" startup                                           │
//   │  "rodada seed" startup Brasil                                       │
//   │  SaaS Brasil lançamento startup                                     │
//   │  "resolveu o problema" startup saas                                 │
//   └─────────────────────────────────────────────────────────────────────┘
//
//   INGLÊS (cobertura global):
//   ┌─────────────────────────────────────────────────────────────────────┐
//   │  "founded the company to solve"                                     │
//   │  "scratching my own itch" startup                                   │
//   │  "the problem we were solving" startup                              │
//   │  "noticed that nobody was" startup founder                          │
//   │  "built it because" startup saas                                    │
//   │  SaaS startup "pain point" "we built"                               │
//   │  "Show HN" "I built" site:news.ycombinator.com                      │
//   └─────────────────────────────────────────────────────────────────────┘
//
// DICA: Você pode usar o operador `site:` para restringir a fontes confiáveis:
//   "fundou uma startup" site:startups.com.br OR site:exame.com OR site:neofeed.com.br
//
// LIMITE: O Google Alerts suporta até ~1000 alertas por conta, mas na prática
//   recomenda-se manter até 30–50 para não sobrecarregar a caixa de saída.
//
// =============================================================================
//
// PATTERNS SUGERIDOS PARA A TASK (inputs.patterns):
//
//   Para usar na task com foco em radar de oportunidades SaaS, configure:
//
//   inputs.topic = "radar oportunidades saas"
//
//   inputs.patterns (semicolon-separated):
//     fundou startup;criou empresa;empreendedor percebeu;
//     nasceu para resolver;identificou oportunidade;
//     problema de mercado;dor do mercado;
//     i built;show hn;scratching;pain point;
//     we built;founded the company;the problem we solved;
//     bootstrapped;indie hacker;saas launched;
//     new product;built in public;problem solution
//
//   inputs.exclude_patterns (ruído a filtrar):
//     patrocinado;publicidade;promoção;concurso;
//     sponsored;advertisement;giveaway;contest;
//     crypto;nft;metaverso;apostas;jogos de azar
//
// =============================================================================
