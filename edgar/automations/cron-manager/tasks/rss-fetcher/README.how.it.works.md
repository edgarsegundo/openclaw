# rss-fetcher — How it works

Coleta notícias de feeds RSS e de scrapers, pontua por relevância ao tópico,
deduplica (na execução e no histórico) e salva o artifact do dia para o rss-picker.
**Não usa IA** — só coleta e filtra.

## Diagrama do fluxo

```
[resolve_feeds] → [fetch_feeds] → [dedup] → [rank_select] → [save_artifact] → [update_history] → [cleanup]
```

Cada caixa é um _checkpoint_ gravado no banco (`step_events`, prefixo `flow.`),
ligado ao `execution_id` da run. No dashboard, clique na linha da execução para
ver o diagrama colorido por status + a lista detalhada abaixo.

## Passo a passo (código real)

1. **resolve_feeds** — Monta a lista de feeds. Se `feeds` foi passado, usa os
   customizados; senão filtra os `DEFAULT_FEEDS` do `feeds_js_file` por `language`
   e `category`. Valida que existe `topic`/`patterns`.
   - meta: `feeds`, `source` (custom/default), `language`, `category`, `max_items`.
2. **fetch_feeds** — Percorre cada feed (tipo `rss` ou `scraper`), baixa o XML
   (sanitizando `&` solto), faz parse e pontua/filtra via `scoreAndFilterItems`
   (patterns positivos/negativos, `since_hours`, robots). Erros por feed viram
   evento item-level `fetch/failed` e entram em `errors[]`. Para em `max_items*2`.
   - meta: `feeds_attempted`, `feeds_failed`, `collected`.
3. **dedup** — Remove duplicados _desta execução_ por fingerprint de título
   (igualdade exata ou similaridade de Jaccard ≥ limite).
   - meta: `before`, `after`, `removed`.
4. **rank_select** — Corta em `max_items` e ordena por `score` desc, depois por
   data mais recente.
   - meta: `selected`, `max_items`, `top_score`.
5. **save_artifact** — Mescla com o artifact já existente do dia
   (`fetched-items-<group>-<YYYY-MM-DD>.json`): itens existentes mantêm posição,
   novos (por `link`) entram ao final ordenados por score. Se não há itens novos,
   o arquivo é preservado (checkpoint `skipped`, reason `no_new_items`).
   - meta: `artifact`, `new_items`, `total_day`.
6. **update_history** — Acrescenta os fingerprints ao `seen-hashes` do grupo
   (dedup entre execuções, mantém ~7 dias).
   - meta: `fingerprints`.
7. **cleanup** — Apaga artifacts `fetched-items-*-<data>.json` com mais de 7 dias.
   - meta: `deleted`.

Também são gravados eventos **item-level** (`step: "fetch"`) para cada item que
entrou no pipeline — esses alimentam o funil do dashboard.

---

**patterns, exclude_patterns e score**

- `patterns`: palavras/frases (`;`) que **aumentam** o score se aparecerem no título.
- `exclude_patterns`: palavras/frases que **reduzem** o score.
- Score = soma dos positivos − negativos (com bônus de proximidade); só entram
  itens com score >= 2.

Próxima etapa: **rss-picker** (triagem inteligente).
