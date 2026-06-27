# publish-article — How it works

Publica **um** artigo por execução: pega o JSON mais antigo gerado pelo
write-article, escolhe o destino por round-robin, faz POST no CMS, move os
arquivos para `published/` e registra no status do dia. Tem também um fluxo
manual `.pub <site_id>` (executa o script de publicação + Google Indexing).

## Diagrama do fluxo (Part 1 — publicação automática)

```
[scan_articles] → [load_article] → [idempotency_check] → [validate_fields] → [resolve_destination] → [post_cms] → [move_published] → [register_status] → [notify] → [cleanup]
```

Cada caixa é um _checkpoint_ (`flow.*`) ligado ao `execution_id`. No dashboard,
clique na linha da execução para ver o diagrama colorido por status. O fluxo
manual `.pub` acende checkpoints extras (`publish_script`, `index_articles`) e o
`l2` acende `list`.

## Passo a passo (código real — Part 1)

1. **scan_articles** — Lista os `.json` em `articles_dir` (ignora roundrobin e
   `status-*`) e pega o mais antigo. Sem artigos → `skipped`
   (reason `no_articles`).
   - meta: `candidates`, `selected`.
2. **load_article** — Lê o JSON; lê o `.md` (ou usa `markdownText` do JSON).
   JSON inválido → `failed` (reason `json_parse`).
   - meta: `slug`.
3. **idempotency_check** — Se o `item_id` já tem `publish/ok` no tracking, pula a
   republicação (`skipped`, reason `already_published`) — evita artigo duplicado
   no CMS em retries.
   - meta: `slug`.
4. **validate_fields** — Exige `title`, `seoMetaDescription`, `slug`. Faltando →
   `failed` (reason `missing_fields`, com a lista no meta).
   - meta: `slug`.
5. **resolve_destination** — Escolhe o destino por round-robin
   (`publish-article.roundrobin.json`), sanitiza o `business_id` e persiste o
   próximo índice.
   - meta: `site_id`, `blog_topic_slug`, `round_robin_idx`.
6. **post_cms** — Monta o payload e faz POST no endpoint de publicação. Falha →
   `failed` (reason `cms_post`, com o status HTTP); o artigo **não** é movido.
   - meta: `slug`, `blog_article_id`, `site_id`.
7. **move_published** — Enriquece o JSON (`sitemap_url`, `site_id`) e move
   JSON+MD para `published/<slug>-<date>.[json|md]`.
   - meta: `slug`.
8. **register_status** — Registra o artigo no `status-<date>.json` (índice
   sequencial, `status: saved`, `blog_article_id`, `site_id`).
   - meta: `index`, `slug`, `site_id`.
9. **notify** — Envia ao Discord a lista do dia, destacando o recém-salvo (🆕).
10. **cleanup** — Apaga arquivos com mais de 7 dias em `published/` e os
    `status-*` antigos do grupo.

Também é gravado o evento item-level (`step: "publish"`) que alimenta o funil.

## Fluxo manual `.pub <site_id>` (Part 2)

- **publish_script** — Acha os artigos `saved` do site no status e executa o
  `execute-publish-script` (`ok`/`failed`).
- **index_articles** — Para cada artigo: deriva a URL, envia ao Google Indexing
  API (evento item-level `step: "index"`), marca como `published` no status e
  notifica o Discord.

Próxima etapa: validar a publicação no destino.
