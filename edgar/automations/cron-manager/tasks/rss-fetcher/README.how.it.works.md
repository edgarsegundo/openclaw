# rss-fetcher — How it works (ultra conciso)

1. Resolve a lista de feeds RSS (customizados ou padrão, filtrando por idioma/categoria).
2. Busca todos os feeds, coletando notícias relevantes ao tópico/padrões informados.
3. Filtra por data (`since_hours`) e por padrões positivos/negativos (veja abaixo).
4. Remove duplicados por fingerprint de título (deduplica por similaridade, não só link/título exato).
5. Ordena por score de relevância e data.
6. Salva apenas os N itens mais relevantes (maior score e mais recentes) no artifact do dia (ex: `raw_news-<id>-YYYY-MM-DD.json`).
   - Mesmo que venham 100 notícias relevantes, **só as N primeiras** (definido por `max_items`, padrão 10) são salvas e avaliadas nas próximas etapas.
   - Para aumentar esse limite, ajuste o parâmetro `max_items` na configuração do fetcher.
7. Apaga artifacts antigos (>7 dias).

- Não usa IA, só coleta e filtra notícias.
- Próxima etapa: rodar rss-picker/feed-selector para triagem inteligente.

---

**Como funciona patterns, exclude_patterns e score:**

- `patterns`: lista de palavras/frases (separadas por `;`) que aumentam o score do item se aparecerem no título (ex: `visto americano; us visa; ds-160`).
- `exclude_patterns`: lista de palavras/frases que reduzem o score se aparecerem no título (ex: `guerra; irã; china`).
- O score é calculado somando pontos para cada padrão positivo encontrado e subtraindo para cada negativo. Só entram itens com score >= 2.
- Quanto mais padrões positivos baterem (e menos negativos), maior a chance do item ser coletado.
- Isso permite filtrar notícias relevantes ao seu interesse e evitar ruído.
