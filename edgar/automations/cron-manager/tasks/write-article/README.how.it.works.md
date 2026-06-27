# write-article — How it works

Lê a lista de artigos aprovados do dia (do rss-picker), mantém um índice de
progresso e gera **um** artigo original por execução com pesquisa web
(Perplexity Sonar Pro), salvando JSON + Markdown.

## Diagrama do fluxo

```
[resolve_list] → [load_articles] → [read_index] → [select_article] → [generate] → [enrich] → [save_artifact] → [advance_index]
```

Cada caixa é um _checkpoint_ (`flow.*`) ligado ao `execution_id`. No dashboard,
clique na linha da execução para ver o diagrama colorido por status. Quando algo
falha, o checkpoint correspondente fica vermelho e o stack trace aparece na lista.

## Passo a passo (código real)

1. **resolve_list** — Resolve `rss_picker_file_pattern` (ex.:
   `approved-{group}-{date}.json`) em `current_approved_list_path`, tolerando a
   virada de meia-noite (hoje → ontem). Se não existir, `skipped`
   (reason `approved_list_missing`). Cria `output_dir/<group>`.
   - meta: `date`, `path`.
2. **load_articles** — Faz parse da lista. Aceita array direto `[{title,link}]`
   ou formato rss-picker `{ items: [...] }`.
   - meta: `articles`.
3. **read_index** — Lê o arquivo de índice (mesmo nome, sem `.json`); inicia em 0
   se não existir. Se o índice já passou do fim da lista, `skipped`
   (reason `all_processed`) — nada a fazer hoje.
   - meta: `index`, `articles`.
4. **select_article** — Seleciona o artigo na posição do índice e valida `title`
   e `link`. Calcula `nextIndex` mas **não grava ainda** (anti-repetição).
   - meta: `index`, `title`, `url`.
5. **generate** — Chama a IA (`runPrompt`) para pesquisar e escrever. Valida o
   retorno mínimo (`slug` + `markdownText`). Falhas aqui (`run_prompt`,
   `incomplete_artifact`) marcam o checkpoint como `failed` e **abortam sem
   avançar o índice** — o cron retenta o mesmo artigo.
   - meta: `words`, `model`, `sources`, `cost_usd`.
6. **enrich** — Aplica `enrichArticle()` (transformações no Markdown/artifact).
   Falha → `failed` (reason `enrich`), aborta.
   - meta: `slug`.
7. **save_artifact** — Grava `<slug>.json` (com `item_id`, referências, contagem
   de palavras) e `<slug>.md` em `output_dir/<group>`. Falha de escrita →
   `failed` (reason `save_json`/`save_md`).
   - meta: `slug`, `words`.
8. **advance_index** — **Só agora** grava `index = nextIndex` (após JSON+MD
   salvos). Se a gravação falhar, o artigo já existe em disco; emite `failed` e
   avisa sobre possível duplicata na próxima run.
   - meta: `from`, `to`.

Também é gravado o evento item-level (`step: "write"`) `started`/`ok`/`failed`
que alimenta o funil do dashboard.

## Inputs

- `rss_picker_file_pattern` — ex.: `approved-{group}-{date}.json`
- `current_approved_list_path` — diretório da lista
- `output_dir` — onde salvar JSON+MD (criado se não existir; usa subpasta `<group>`)
- `language` (default `pt-BR`), `blog_context` (opcional)

Próxima etapa: **publish-article**.
