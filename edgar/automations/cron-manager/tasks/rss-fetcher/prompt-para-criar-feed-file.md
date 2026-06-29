Crie um arquivo feeds.js compatível com a task rss-fetcher descrita abaixo.

## Contrato obrigatório de cada entrada

Cada objeto do array DEFAULT_FEEDS deve ter exatamente estes campos:
url — string com a URL do feed RSS (use "PLACEHOLDER_ALERT_nome" para Google Alerts)
name — string com nome legível da fonte
lang — "pt" | "en" | "es" | "unknown"
category — string com o nome da categoria (use os nomes que eu definir abaixo)
type — "rss" | "scraper"

Campos opcionais permitidos:
notes — observação sobre o feed
alert_query — query exata usada para criar o alerta no Google Alerts

Não invente campos fora desta lista.

## Exports obrigatórios

O arquivo deve exportar:

1. export const DEFAULT_FEEDS = [ ... ]
2. export function parseCustomFeeds(feedsString) que converte
   uma string de URLs separadas por vírgula em um array de feeds
   com url, name, lang: "unknown", category: "custom", type: "rss"

## Tema do projeto

DESCREVA_AQUI_O_QUE_VOCÊ_QUER_MONITORAR
(ex: oportunidades de negócios em SaaS B2B para pequenas empresas)

## Categorias e idiomas

Crie feeds para estas categorias:

- CATEGORIA_1: DESCRIÇÃO (lang: "pt")
- CATEGORIA_2: DESCRIÇÃO (lang: "en")
- alerts_br: Google Alerts em PT com queries focadas em histórias de origem de empresas
- alerts_en: Google Alerts em EN com queries focadas em founder stories e lançamentos

## Quantidade

- Mínimo de NUMERO_FEEDS feeds RSS reais por categoria
- Mínimo de NUMERO_ALERTAS Google Alerts por idioma
- Prefira fontes especializadas no tema, não portais genéricos

## Extras

- Inclua campo alert_query em todos os alertas com a query exata
- Adicione campo notes explicando por que cada fonte é relevante
- No final, inclua um bloco de comentário com inputs.patterns sugeridos
  para configurar a task, separados por ponto-e-vírgula
