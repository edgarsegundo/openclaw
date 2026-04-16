# publish-article — Spec: Arquivo Status + Controle de Notificações Discord

## Problema resolvido

A task roda a cada minuto via cron. Sem controle, enviaria mensagens ao Discord
em toda execução — mesmo quando nada de novo aconteceu. O arquivo status do dia
resolve isso: a mensagem só é enviada quando um novo artigo passa pela Parte 1.

---

## Arquivo status do dia

### Nome e localização
```
{articles_dir}/status-<YYYY-MM-DD>.json
```
Um arquivo por tópico (por `articles_dir`) por dia. Deletado automaticamente
pelo `cleanOldFiles` junto com os arquivos de `published/` após 7 dias.

### Estrutura
```json
{
  "date": "2025-04-16",
  "articles": [
    {
      "index": 0,
      "slug": "como-tirar-visto-americano-2025-04-16",
      "status": "saved",
      "saved_at": "2025-04-16T10:00:00.000Z",
      "published_at": null
    },
    {
      "index": 1,
      "slug": "visto-americano-estudantes-2025-04-16",
      "status": "published",
      "saved_at": "2025-04-16T10:01:00.000Z",
      "published_at": "2025-04-16T10:15:00.000Z"
    }
  ]
}
```

### Regras
- `index` é sequencial, começa em 0, permanente pelo dia — nunca muda após atribuído.
- `slug` é o nome do arquivo sem extensão (ex: `meu-artigo-2025-04-16`).
- `status` começa como `"saved"` (Parte 1) e avança para `"published"` (Parte 2).
- `published_at` é `null` até a Parte 2 ser executada com sucesso.
- O índice de um artigo é sempre o mesmo, independente de quantas vezes `/pub N` for executado.

---

## Fluxo completo

### Execução normal (cron, sem `action`/`item_index`)

1. Lê `articles_dir` e encontra `.json` não-publicados (excluindo `publish-article.roundrobin.json`).
2. Se **não há nenhum arquivo novo**: encerra silenciosamente. Sem Discord. Sem logs extras.
3. Se **há arquivo novo**: executa a Parte 1 (POST banco + move para `published/`).
4. Se Parte 1 falha: encerra com erro. Sem Discord.
5. Se Parte 1 **sucede**:
   - Carrega o status do dia (ou cria um novo se não existir).
   - Adiciona o artigo ao status com `status: "saved"`, atribuindo o próximo índice sequencial.
   - Salva o arquivo status.
   - Envia lista Discord com todos os artigos do dia (ver formato abaixo).
6. `cleanOldFiles` roda no `published/` e também no `articles_dir` (para limpar status antigos).

### Execução com comando `/pub N` (`action=pub`, `item_index=N`)

1. Não executa a Parte 1.
2. Carrega o status do dia.
3. Busca o artigo com `index === N` no status.
4. Se não encontrado: loga aviso e encerra.
5. Executa a Parte 2: `postPublish` + `submitToIndexingApi`.
6. Se sucesso: atualiza `status: "published"` e `published_at` no status. Salva.
7. Notifica Discord com resultado (sucesso ou falha).

---

## Mensagem Discord — formato

Enviada **somente** quando a Parte 1 executa com sucesso.
Mostra **todos os artigos do dia** com seu status atual.
Artigos recém adicionados nessa execução são destacados com 🆕.

```
📰 Artigos do dia — "visto-americano":
> /pub <N> para publicar e indexar no Google

🆕 [2] como-tirar-visto-americano-2025-04-16 (saved)
    [1] visto-americano-estudantes-2025-04-16 (published ✅)
    [0] tipos-de-visto-americano-2025-04-16 (saved)
```

Regras:
- Ordenação: mais recentes primeiro (índice decrescente) para o novo aparecer no topo.
- 🆕 = artigo adicionado ao status nessa execução (recém saído da Parte 1).
- `(saved)` = Parte 1 concluída, aguardando `/pub N`.
- `(published ✅)` = Parte 2 concluída.
- Se ultrapassar 2000 caracteres: `sendInChunks` com header de continuação.

---

## Limpeza de arquivos antigos

`cleanOldFiles` deve rodar em dois lugares:
- `published/` — arquivos `.json` e `.md` com mais de 7 dias.
- `articles_dir` — arquivos `status-<YYYY-MM-DD>.json` com mais de 7 dias.

---

## O que NÃO muda

- Lógica da Parte 1 (POST, round-robin, move arquivos).
- Lógica da Parte 2 (`postPublish` + `submitToIndexingApi`).
- `publish-article.roundrobin.json`.
- `cleanOldFiles` para `.json`/`.md` em `published/`.
- Validação de inputs e campos obrigatórios.
