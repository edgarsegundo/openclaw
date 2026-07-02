/**
 * feeds.js — Notícias sobre emprego na região de Campinas (RMC)
 *
 * Projeto: blog de notícias do https://empregoaqui.com.br/ — plataforma de
 * vagas de emprego via WhatsApp focada na Região Metropolitana de Campinas
 * (Campinas, Sumaré, Hortolândia, Valinhos, Vinhedo, Paulínia, Indaiatuba,
 * Americana e cidades vizinhas).
 *
 * Fontes organizadas por categoria:
 *   vagas_campinas — imprensa regional/nacional com cobertura de emprego,
 *                    indústria, concursos e mercado de trabalho relevante
 *                    para a RMC
 *   alerts_br      — Google Alerts em PT-BR com queries focadas em vagas,
 *                    mutirões de emprego e contratações na região de Campinas
 *
 * IMPORTANTE — Google Alerts:
 *   Substitua os placeholders PLACEHOLDER_ALERT_xxx pelas URLs reais dos
 *   feeds gerados em alerts.google.com. Veja o guia completo no final deste
 *   arquivo (seção GOOGLE ALERTS SETUP).
 *
 * Cada entrada:
 *   url         — URL do feed RSS (obrigatório; "PLACEHOLDER_ALERT_nome" para Google Alerts)
 *   name        — Nome legível da fonte (obrigatório)
 *   lang        — 'pt' (obrigatório)
 *   category    — Tag de categoria (obrigatório)
 *   type        — 'rss' | 'scraper' (obrigatório)
 *   notes       — Observação opcional sobre o feed
 *   alert_query — Query exata usada para criar o alerta no Google Alerts (somente alerts_br)
 *
 * Todas as URLs de RSS abaixo (exceto os placeholders de Google Alerts) foram
 * checadas manualmente (HTTP 200 + itens reais no feed) antes de entrarem
 * nesta lista.
 */

export const DEFAULT_FEEDS = [
  // ─────────────────────────────────────────────────────────────────────────
  // CATEGORIA: vagas_campinas — Imprensa regional e nacional com cobertura
  // de emprego, indústria e mercado de trabalho relevante para a RMC
  // ─────────────────────────────────────────────────────────────────────────

  {
    url: "https://diariodocomercio.com.br/feed/",
    name: "Diário do Comércio (Campinas)",
    lang: "pt",
    category: "vagas_campinas",
    type: "rss",
    notes:
      "Jornal de economia e negócios de Campinas (grupo RAC) — única fonte regional confirmada com feed RSS ativo; cobre indústria, comércio e mercado de trabalho local",
  },
  {
    url: "https://g1.globo.com/rss/g1/economia/concursos-e-emprego/",
    name: "G1 — Concursos e Emprego",
    lang: "pt",
    category: "vagas_campinas",
    type: "rss",
    notes:
      "Feed nacional dedicado a vagas de emprego e concursos públicos — alta aderência direta ao tema do blog; filtrar por patterns de cidade",
  },
  {
    url: "https://g1.globo.com/rss/g1/economia/",
    name: "G1 — Economia",
    lang: "pt",
    category: "vagas_campinas",
    type: "rss",
    notes:
      "Economia nacional — útil para notícias de indústria, CAGED e geração de emprego que afetam a região",
  },
  {
    url: "https://g1.globo.com/rss/g1/",
    name: "G1 — Geral",
    lang: "pt",
    category: "vagas_campinas",
    type: "rss",
    notes:
      "Maior portal de notícias do Brasil — cobre fatos de Campinas e região quando relevantes; filtrar pelo scoring de patterns",
  },
  {
    url: "https://agenciabrasil.ebc.com.br/rss/economia/feed.xml",
    name: "Agência Brasil — Economia",
    lang: "pt",
    category: "vagas_campinas",
    type: "rss",
    notes: "Agência pública — boa cobertura de CAGED, geração de empregos e políticas de trabalho",
  },
  {
    url: "https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml",
    name: "Agência Brasil — Últimas Notícias",
    lang: "pt",
    category: "vagas_campinas",
    type: "rss",
  },
  {
    url: "https://www.metropoles.com/tag/emprego/feed",
    name: "Metrópoles — Emprego",
    lang: "pt",
    category: "vagas_campinas",
    type: "rss",
    notes: "Tag dedicada a emprego — CAGED, RAIS, contratações e empregabilidade",
  },
  {
    url: "https://exame.com/feed/",
    name: "Exame",
    lang: "pt",
    category: "vagas_campinas",
    type: "rss",
    notes:
      "Negócios e economia — perfis de empresas que contratam e indicadores de mercado de trabalho",
  },
  {
    url: "https://www.infomoney.com.br/feed/",
    name: "InfoMoney",
    lang: "pt",
    category: "vagas_campinas",
    type: "rss",
    notes:
      "Economia e finanças — indicadores de emprego e mercado que afetam contratações regionais",
  },
  {
    url: "https://www.moneytimes.com.br/feed/",
    name: "Money Times",
    lang: "pt",
    category: "vagas_campinas",
    type: "rss",
  },
  {
    url: "https://www.gazetadopovo.com.br/feed/rss/economia.xml",
    name: "Gazeta do Povo — Economia",
    lang: "pt",
    category: "vagas_campinas",
    type: "rss",
    notes:
      "Economia nacional com boa cobertura de indústria — útil para vagas ligadas a fábricas e polos industriais",
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
  // ─────────────────────────────────────────────────────────────────────────

  {
    url: "PLACEHOLDER_ALERT_vagas_campinas",
    name: 'Google Alert BR — "vagas de emprego" Campinas',
    lang: "pt",
    category: "alerts_br",
    type: "rss",
    notes: "Captura anúncios diretos de vagas abertas em Campinas",
    alert_query: '"vagas de emprego" Campinas',
  },
  {
    url: "PLACEHOLDER_ALERT_mutirao_emprego_campinas",
    name: 'Google Alert BR — "mutirão de emprego" Campinas',
    lang: "pt",
    category: "alerts_br",
    type: "rss",
    notes: "Mutirões de emprego são eventos de alta relevância direta para o público do WhatsApp",
    alert_query: '"mutirão de emprego" Campinas',
  },
  {
    url: "PLACEHOLDER_ALERT_sine_campinas",
    name: "Google Alert BR — SINE Campinas vagas",
    lang: "pt",
    category: "alerts_br",
    type: "rss",
    notes: "SINE (Sistema Nacional de Emprego) publica vagas oficiais periodicamente",
    alert_query: "SINE Campinas vagas emprego",
  },
  {
    url: "PLACEHOLDER_ALERT_pat_campinas",
    name: "Google Alert BR — PAT Campinas emprego",
    lang: "pt",
    category: "alerts_br",
    type: "rss",
    notes: "Posto de Atendimento ao Trabalhador — fonte oficial de vagas na região",
    alert_query: "PAT Campinas emprego vagas",
  },
  {
    url: "PLACEHOLDER_ALERT_vagas_sumare",
    name: 'Google Alert BR — "vagas de emprego" Sumaré',
    lang: "pt",
    category: "alerts_br",
    type: "rss",
    alert_query: '"vagas de emprego" Sumaré',
  },
  {
    url: "PLACEHOLDER_ALERT_vagas_hortolandia",
    name: 'Google Alert BR — "vagas de emprego" Hortolândia',
    lang: "pt",
    category: "alerts_br",
    type: "rss",
    alert_query: '"vagas de emprego" Hortolândia',
  },
  {
    url: "PLACEHOLDER_ALERT_vagas_valinhos_vinhedo",
    name: 'Google Alert BR — "vagas de emprego" Valinhos OR Vinhedo',
    lang: "pt",
    category: "alerts_br",
    type: "rss",
    alert_query: '"vagas de emprego" (Valinhos OR Vinhedo)',
  },
  {
    url: "PLACEHOLDER_ALERT_empresa_contrata_campinas",
    name: 'Google Alert BR — "empresa contrata" Campinas',
    lang: "pt",
    category: "alerts_br",
    type: "rss",
    notes: "Captura anúncios de empresas que abriram processos seletivos na região",
    alert_query: '"empresa contrata" Campinas',
  },
  {
    url: "PLACEHOLDER_ALERT_fabrica_vagas_campinas",
    name: "Google Alert BR — fábrica abre vagas Campinas/Paulínia/Indaiatuba",
    lang: "pt",
    category: "alerts_br",
    type: "rss",
    notes:
      "Polo industrial da RMC (Paulínia, Indaiatuba, Hortolândia) gera vagas em massa quando fábricas expandem",
    alert_query: 'fábrica "abre vagas" (Campinas OR Paulínia OR Indaiatuba)',
  },
  {
    url: "PLACEHOLDER_ALERT_caged_campinas",
    name: "Google Alert BR — CAGED Campinas emprego",
    lang: "pt",
    category: "alerts_br",
    type: "rss",
    notes:
      "CAGED regional indica tendência de contratação/demissão que contextualiza os posts do blog",
    alert_query: "CAGED Campinas emprego",
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
//   2. Digite a query exata (ex: "mutirão de emprego" Campinas)
//   3. Clique em "Mostrar opções"
//   4. Configure:
//        Frequência:  Assim que acontecer
//        Fontes:      Notícias (foco em jornais) ou Automático (mais abrangente)
//        Idioma:      Português
//        Região:      Brasil
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
//   ┌─────────────────────────────────────────────────────────────────────┐
//   │  "vagas de emprego" Campinas                                        │
//   │  "mutirão de emprego" Campinas                                      │
//   │  SINE Campinas vagas emprego                                        │
//   │  PAT Campinas emprego vagas                                         │
//   │  "vagas de emprego" Sumaré                                          │
//   │  "vagas de emprego" Hortolândia                                     │
//   │  "vagas de emprego" (Valinhos OR Vinhedo)                           │
//   │  "empresa contrata" Campinas                                        │
//   │  fábrica "abre vagas" (Campinas OR Paulínia OR Indaiatuba)          │
//   │  CAGED Campinas emprego                                             │
//   └─────────────────────────────────────────────────────────────────────┘
//
// DICA: use o operador `site:` para restringir a fontes confiáveis, ex.:
//   "vagas de emprego" Campinas site:diariodocomercio.com.br OR site:g1.globo.com
//
// LIMITE: o Google Alerts suporta até ~1000 alertas por conta, mas na prática
//   recomenda-se manter até 30–50 para não sobrecarregar a caixa de saída.
//
// =============================================================================
//
// PATTERNS SUGERIDOS PARA A TASK (inputs.patterns):
//
//   inputs.topic = "vagas de emprego Campinas e região"
//
//   inputs.patterns (separados por ponto-e-vírgula):
//     vaga de emprego;vagas de emprego;emprego Campinas;contrata;contratação;
//     mutirão de emprego;SINE Campinas;PAT Campinas;CAGED;carteira assinada;
//     processo seletivo;vaga CLT;emprego Sumaré;emprego Hortolândia;
//     emprego Valinhos;emprego Vinhedo;emprego Paulínia;emprego Indaiatuba;
//     emprego Americana;fábrica contrata;indústria contrata;RH Campinas;
//     estágio Campinas;jovem aprendiz Campinas
//
//   inputs.exclude_patterns (ruído a filtrar):
//     patrocinado;publicidade;horóscopo;famosos;celebridades;novela;
//     futebol;crime;violência;trânsito;concurso de beleza
//
// =============================================================================
