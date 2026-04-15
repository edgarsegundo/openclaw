# rss-picker — Refactoring Spec

## Contexto geral

A task `rss-picker` lê o arquivo diário gerado pelo `rss-fetcher`, filtra itens já
resolvidos, e decide entre dois caminhos:

- **Caminho IA**: atingiu `min_items` não-resolvidos → envia para triagem via Perplexity Sonar
- **Caminho humano**: não atingiu `min_items` → notifica Discord com a lista de pendentes e aguarda comando manual (`/pub` ou `/del`)

O arquivo `status-<topicSlug>-<YYYY-MM-DD>.json` é a fonte de verdade para saber quais
itens já foram resolvidos (por humano ou por IA). Ele é consultado em múltiplos pontos
do fluxo para ignorar itens já tratados.

---

## O que foi removido

- `pending-approval-<topicSlug>.json` — eliminado completamente
- `last_run.json` — eliminado completamente. A filtragem de itens já vistos passa a ser
  feita exclusivamente pelo arquivo `status`.

---

## Arquivo status

### Nome
```
artifacts/rss-picker/status-<topicSlug>-<YYYY-MM-DD>.json
```

### Estrutura
```json
{
  "topic": "visto americano",
  "topic_slug": "visto-americano",
  "date": "2025-04-15",
  "resolved": [
    { "fetcher_index": 0, "action": "approved", "resolved_at": "2025-04-15T10:23:00.000Z" },
    { "fetcher_index": 3, "action": "deleted",  "resolved_at": "2025-04-15T10:25:00.000Z" }
  ]
}
```

### Regras
- `fetcher_index` é a posição **0-based** do item no array `allItems` do fetcher.
- O usuário sempre recebe e informa índices **1-based** (exibição). A conversão é interna.
- Um novo arquivo é criado a cada dia. Não há migração entre dias.
- O arquivo é deletado junto com os outros após 7 dias pelo ciclo de limpeza existente
  (o regex de limpeza deve ser atualizado para incluir arquivos `status-`).

---

## Inputs da task

| Input | Tipo | Default | Descrição |
|---|---|---|---|
| `rss_fetcher_output_artifact_file_name_pattern` | string | — | Padrão com `{date}`, ex: `artifacts/rss-fetcher/rss-artifact-visto-americano-{date}.json` |
| `blog_context` | string | — | Contexto do blog para a IA |
| `min_items` | number | 3 | Mínimo de itens não-resolvidos para acionar IA |
| `min_score` | number | 7 | Score mínimo para aprovação pela IA |
| `action` | string | null | `"pub"` ou `"del"` |
| `item_index` | number | null | Índice 1-based do item no fetcher (para comandos manuais) |

> `force` foi removido — não existe mais.

---

## Fluxo completo

### Passo 1 — Setup inicial
- Garantir que o diretório `artifacts/rss-picker/` existe.
- Resolver o caminho do arquivo do fetcher para hoje (`{date}` → `YYYY-MM-DD`).
- Abortar com log se o arquivo não existir.
- Ler `allItems` e `topic`/`topicSlug` do arquivo do fetcher.

### Passo 2 — Carregar o arquivo status do dia
- Tentar ler `artifacts/rss-picker/status-<topicSlug>-<today>.json`.
- Se não existir, `resolvedSet` começa vazio.
- Montar `resolvedSet`: um `Set` de `fetcher_index` já resolvidos, para lookup O(1).

### Passo 3 — Processar comando manual (`action` + `item_index`)

Executado **antes** de qualquer outra lógica quando ambos estão definidos.

#### `/pub <N>` — aprovar manualmente

1. Converter `item_index` (1-based) para `fetcherIndex` (0-based).
2. Validar que `fetcherIndex` está dentro dos limites de `allItems`.
3. Verificar se já está no `resolvedSet` — se sim, logar aviso e abortar.
4. Ler o item em `allItems[fetcherIndex]`.
5. Gravar/atualizar `approved-<topicSlug>-<today>.json` adicionando o item aprovado
   (mesmo formato dos itens aprovados pela IA: `title`, `link`, `published`, `source`,
   `score: 10`, `approved_at`).
6. Gravar/atualizar o arquivo status adicionando `{ fetcher_index, action: "approved", resolved_at }`.
7. Logar resultado e encerrar.

#### `/del <N>` — deletar manualmente

1. Converter `item_index` (1-based) para `fetcherIndex` (0-based).
2. Validar que `fetcherIndex` está dentro dos limites de `allItems`.
3. Verificar se já está no `resolvedSet` — se sim, logar aviso e abortar.
4. Gravar/atualizar o arquivo status adicionando `{ fetcher_index, action: "deleted", resolved_at }`.
5. Logar resultado e encerrar. *(Nenhum arquivo approved é tocado.)*

### Passo 4 — Filtrar itens não-resolvidos
```
unresolvedItems = allItems
  .map((item, idx) => ({ ...item, fetcherIndex: idx }))
  .filter(item => !resolvedSet.has(item.fetcherIndex))
```

### Passo 5 — Verificar threshold

```
if (unresolvedItems.length < minItems)
```

- Se **abaixo do threshold** e há pelo menos 1 item não-resolvido:
  - Montar mensagem Discord com lista de itens não-resolvidos, usando `fetcherIndex + 1`
    como índice exibido (1-based). Índices podem ser não-contíguos, ex: 1, 3, 5. Isso é esperado.
  - Formato da mensagem:
    ```
    🆕 Itens pendentes para o tópico "<topic>":
    > /pub <N> ou /del <N>

    1. **Título do item**
       <link>
       Data: dd-mmm-aaaa hh:mm:ss

    3. **Outro título**
       <link>
       Data: dd-mmm-aaaa hh:mm:ss
    ```
  - Chamar `notifyDiscord(msg)`.
- Encerrar (não roda IA).
- Se **abaixo do threshold** e não há nenhum item não-resolvido: encerrar silenciosamente.

### Passo 6 — Deduplicar por URL real
- Aplicar `extractRealUrl` para detectar duplicatas.
- Manter apenas a primeira ocorrência de cada URL real.
- Apenas sobre `unresolvedItems`.

### Passo 7 — Preparar e enviar para a IA
- Strip de HTML em títulos e summaries.
- Chamar `runPrompt` com `topic`, `items_json`, `total_items`.

### Passo 8 — Processar resultado da IA
- Filtrar `artifact.results` com `score >= minScore` → `approvedItems`.
- Logar resumo (total avaliado, aprovados, custo).

### Passo 9 — Gravar arquivo approved
- Ler `approved-<topicSlug>-<today>.json` se existir.
- Deduplica por link real antes de adicionar.
- Gravar versão atualizada.

### Passo 10 — Atualizar arquivo status com resultado da IA
- Para cada item em `artifact.results`:
  - Se `score >= minScore` → adicionar ao status com `action: "approved"`.
  - Se `score < minScore` → adicionar ao status com `action: "deleted"`.
- O `fetcher_index` de cada item é o `fetcherIndex` carregado no passo 4.
- Gravar o arquivo status atualizado.

### Passo 11 — Limpar arquivos antigos (>7 dias)
- Regex atualizado para limpar **ambos** os padrões:
  - `approved-<slug>-<YYYY-MM-DD>.json`
  - `status-<slug>-<YYYY-MM-DD>.json`

### Passo 12 — Log final
- Resumo da execução: itens avaliados, aprovados, arquivo gerado.

---

## Mapeamento item ↔ fetcher_index durante triagem da IA

O array enviado à IA é derivado de `unresolvedItems` (já filtrado e deduplicado).
Para conseguir gravar o `fetcher_index` correto no status após a IA responder,
é necessário manter um mapa `link → fetcherIndex` antes de enviar à IA:

```js
const linkToFetcherIndex = {};
for (const item of unresolvedItems) {
  linkToFetcherIndex[extractRealUrl(item.link)] = item.fetcherIndex;
}
```

Após a IA retornar, para cada resultado usar:
```js
const fi = linkToFetcherIndex[extractRealUrl(result.link)];
```

---

## Funções helper mantidas

- `extractRealUrl(link)` — extrai URL real de redirect Google
- `sanitizeGoogleLink(link)` — idem, mas para gravar no approved
- `stripHtmlTags(str)` — remove tags HTML e entidades
- `formatDate(dateStr)` — formata para `dd-mmm-aaaa hh:mm:ss`

---

## Função helper nova

### `loadStatus(topicSlug, today)`
Lê o arquivo status do dia e retorna `{ statusData, resolvedSet }`.
- `statusData`: objeto JSON ou estrutura vazia padrão se arquivo não existe.
- `resolvedSet`: `Set<number>` com os `fetcher_index` já resolvidos.

### `saveStatus(topicSlug, today, statusData)`
Grava o arquivo status no caminho correto.

### `addToStatus(statusData, fetcherIndex, action)`
Adiciona uma entrada ao array `resolved` e retorna o `statusData` atualizado.
Não grava no disco — apenas manipula o objeto.

---

## Diagrama de fluxo simplificado

```
START
  │
  ├─ Carregar fetcher file → allItems
  ├─ Carregar status do dia → resolvedSet
  │
  ├─ action + item_index definidos?
  │     ├─ /pub N → gravar approved + status → END
  │     └─ /del N → gravar status → END
  │
  ├─ Filtrar unresolvedItems (excluir resolvedSet)
  │
  ├─ unresolvedItems.length < minItems?
  │     └─ SIM → notifyDiscord (só pendentes) → END
  │
  ├─ Deduplicar por URL real
  ├─ Chamar IA
  ├─ Gravar approved (score >= minScore)
  ├─ Gravar status (todos os avaliados pela IA)
  ├─ Limpar arquivos antigos
  └─ END
```
