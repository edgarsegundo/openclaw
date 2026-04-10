# rss-fetcher — How it works (ultra conciso)

1. Resolve a lista de feeds RSS (customizados ou padrão, filtrando por idioma/categoria).
2. Busca todos os feeds, coletando notícias relevantes ao tópico/padrões informados.
3. Filtra por data (since_hours) e por padrões positivos/negativos.
4. Remove duplicados por link/título.
5. Ordena por score de relevância e data.
6. Salva até N itens no artifact do dia (ex: `raw_news-<id>-YYYY-MM-DD.json`).
7. Apaga artifacts antigos (>7 dias).

- Não usa IA, só coleta e filtra notícias.
- Próxima etapa: rodar rss-picker/feed-selector para triagem inteligente.
