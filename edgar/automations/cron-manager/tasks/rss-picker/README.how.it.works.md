# rss-picker — How it works (ultra conciso)

1. Lê o arquivo de notícias do dia (ex: `artifacts/rss-fetcher/rss-artifact-<topic>-{YYYY-MM-DD}.json`).
2. Filtra apenas itens publicados após a última execução (por tópico).
3. Se houver menos que o mínimo (default: 3), finaliza sem rodar IA.
4. Remove duplicados por URL real.
5. Envia os itens novos para triagem via IA (Perplexity Sonar Small).
6. Aprova apenas os itens com score >= min_score (default: 7).
7. Acrescenta os aprovados ao arquivo diário `approved-<topic>-{YYYY-MM-DD}.json` (sem duplicar links).
8. Apaga arquivos diários com mais de 7 dias.
9. Atualiza o registro de última execução (`last_run.json`).

- Cada execução só processa notícias novas do dia.
- Não reprocessa itens antigos.
- Sempre mantém apenas 7 dias de backlog.
- Próxima etapa: rodar o article-writer com o arquivo aprovado do dia.
