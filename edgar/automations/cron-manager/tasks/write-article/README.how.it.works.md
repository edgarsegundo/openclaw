# write-article — How it works (ultra conciso)

1. Recebe título e link de notícia (inputs obrigatórios).
2. Chama IA (Perplexity Sonar Pro) para pesquisar e gerar artigo original.
3. Enriquece o artigo (ex: imagens, SEO, etc) via enrichArticle().
4. Salva JSON estruturado e Markdown em `artifacts/write-article/`.
5. Mostra resumo, fontes consultadas e custo.

- Usa IA para gerar conteúdo original e estruturado.
- Próxima etapa: publicar o artigo gerado.
