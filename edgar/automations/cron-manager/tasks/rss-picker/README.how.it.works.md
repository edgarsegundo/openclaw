# rss-picker — How it works (ultra conciso)


1. Lê o arquivo de notícias do dia (ex: `artifacts/rss-fetcher/rss-artifact-<topic>-{YYYY-MM-DD}.json`).
2. Filtra apenas itens publicados após a última execução (por tópico).
3. (min_items) Se houver menos que o mínimo (default: 3), **não roda IA** e só notifica o Discord com a lista de novos itens **se a lista de pendentes aumentar ou mudar em relação à última notificação**.
    - Só salva/atualiza o arquivo `artifacts/rss-picker/pending-approval-<topicSlug>.json` se a lista de pendentes aumentar ou mudar.
    - Se não houver novidade, não notifica nem sobrescreve o arquivo.
    - O parâmetro `force` permite rodar IA mesmo com menos que o mínimo.
4. Se o parâmetro `item_index` for definido, processa apenas o item de índice correspondente na lista de pendências (`pending-approval-<topicSlug>.json`), ignora o mínimo de itens, **não roda IA** e grava direto o arquivo aprovado no formato do schema.js.
    - O índice informado pelo usuário é **1-based** (começa em 1).
    - Após aprovação manual, o arquivo de pendências é apagado.
    - Se não existir item nesse índice, a execução termina com aviso.
5. Remove duplicados por URL real.
6. Se IA for rodada, envia os itens novos para triagem via IA (Perplexity Sonar Small).
    - Após rodar a IA, o arquivo de pendências é apagado (se existir).
7. Aprova apenas os itens com score >= min_score (default: 7).
8. Acrescenta os aprovados ao arquivo diário `approved-<topic>-{YYYY-MM-DD}.json` (sem duplicar links).
9. Apaga arquivos diários com mais de 7 dias.
10. Atualiza o registro de última execução (`last_run.json`).


---

**Resumo dos fluxos:**

- Execução normal: só processa se houver pelo menos `min_items` novos, envia para IA, aprova por score, grava arquivo. Se não atingir o mínimo, só notifica o Discord e atualiza a lista de pendentes se houver novidade (lista de pendentes maior ou diferente da última notificação).
- Com `force: true`: ignora mínimo de itens, mas segue fluxo normal (com IA).
- Com `item_index` definido: processa só o item escolhido na lista de pendências (`pending-approval-<topicSlug>.json`), ignora mínimo de itens, **não roda IA**, grava direto o arquivo aprovado no formato do schema.js. O índice é 1-based.

- Cada execução só processa notícias novas do dia.
- Não reprocessa itens antigos.
- Sempre mantém apenas 7 dias de backlog.
- Próxima etapa: rodar o article-writer com o arquivo aprovado do dia.
