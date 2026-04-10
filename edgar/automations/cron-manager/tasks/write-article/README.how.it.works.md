# write-article — How it works (ultra conciso)

1. Resolve arquivo JSON com padrão de data: `approved-visto-americano-[aaaa-mm-dd].json` → `approved-visto-americano-2026-04-10.json`
2. Lê lista de artigos aprovados (JSON array com `title` e `link`).
3. Lê ou inicializa índice (arquivo sem extensão com número: 0, 1, 2...).
4. 🔒 **Atualiza índice ANTES de gerar** (anti-repetição: se falhar aqui, aborta; se gerar falhar depois, tudo bem).
5. Seleciona artigo na posição do índice.
6. Chama IA (Perplexity Sonar Pro) para pesquisar e gerar artigo original.
7. Enriquece o artigo via `enrichArticle()`.
8. Salva JSON estruturado e Markdown em `artifacts/write-article/`.
9. Mostra resumo, fontes consultadas, custo e contagem de artigos processados.

**Inputs:**
- `rss_picker_file_pattern` (ex: `approved-visto-americano-[aaaa-mm-dd].json`)
- `current_approved_list_path` (diretório onde a lista está)
- `language` (padrão: pt-BR)
- `blog_context` (opcional, contexto do blog)
