# publish-article — How it works (ultra conciso)

1. Busca o artigo mais antigo (JSON) em `articles_dir`.
2. Carrega o JSON e o Markdown correspondente (se existir).
3. Seleciona o destino (business_id/blog_topic_slug) via round-robin, persistindo o estado.
4. Monta o payload e faz POST para o endpoint de publicação.
5. Se sucesso, move os arquivos usados para `published/` (com data no nome).
6. Apaga arquivos antigos (>7 dias) em `published/`.

- Só publica um artigo por execução.
- Mantém alternância de destino entre execuções.
- Próxima etapa: validar publicação no destino.
