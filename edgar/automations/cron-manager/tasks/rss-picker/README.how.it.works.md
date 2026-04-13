# rss-picker — How it works (ultra conciso)

1. Lê o arquivo de notícias do dia (ex: `artifacts/rss-fetcher/rss-artifact-<topic>-{YYYY-MM-DD}.json`).
2. Filtra apenas itens publicados após a última execução (por tópico).
3. (min_items) Se houver menos que o mínimo (default: 3), finaliza sem rodar IA.
        > Se houver menos que o mínimo (padrão: 3) itens novos, encerra sem rodar IA — isso evita gastar tokens processando artigos individualmente e garante que a triagem só aconteça em lotes de pelo menos 3 notícias.

        - **Caminho alternativo:**
            - Se o parâmetro `item_index` for definido, a task processa apenas o item de índice correspondente na lista de novos itens, ignora o mínimo de itens, **pula a etapa de IA** e grava direto o arquivo aprovado no formato do schema.js.
            - Se não existir item nesse índice, a execução termina com aviso.
            - O parâmetro `force` permite rodar mesmo com menos que o mínimo, mas segue o fluxo normal (com IA).

4. Remove duplicados por URL real.
5. Se `item_index` não estiver definido, envia os itens novos para triagem via IA (Perplexity Sonar Small).
6. Aprova apenas os itens com score >= min_score (default: 7).
7. Acrescenta os aprovados ao arquivo diário `approved-<topic>-{YYYY-MM-DD}.json` (sem duplicar links).
8. Apaga arquivos diários com mais de 7 dias.
9. Atualiza o registro de última execução (`last_run.json`).


---

**Resumo dos fluxos:**

- Execução normal: só processa se houver pelo menos `min_items` novos, envia para IA, aprova por score, grava arquivo.
- Com `force: true`: ignora mínimo de itens, mas segue fluxo normal (com IA).
- Com `item_index` definido: processa só o item escolhido, ignora mínimo de itens, **não roda IA**, grava direto o arquivo aprovado no formato do schema.js.

- Cada execução só processa notícias novas do dia.
- Não reprocessa itens antigos.
- Sempre mantém apenas 7 dias de backlog.
- Próxima etapa: rodar o article-writer com o arquivo aprovado do dia.
