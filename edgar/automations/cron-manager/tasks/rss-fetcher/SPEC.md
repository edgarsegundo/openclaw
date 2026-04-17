# Spec: Deduplicação Histórica — rss-fetcher

## Contexto

O `rss-fetcher` já possui deduplicação **intra-execução** (passo 5, por `link` ou `title`).
O problema: entre execuções de dias diferentes, o mesmo artigo pode reaparecer porque não há memória persistida.
Esta spec define um mecanismo de histórico de fingerprints para eliminar duplicatas cross-execução.

---

## 1. Arquivo de histórico

| Atributo | Valor |
|---|---|
| Caminho | `artifacts/rss-fetcher/seen_hashes.json` |
| Escopo | Global (todos os tópicos, todas as execuções) |
| Criação | Automática na primeira execução se não existir |
| Atualização | Ao final de cada execução, append dos novos hashes coletados |

---

## 2. Estrutura do arquivo

Usar um **objeto hash-map** para lookup O(1):

```json
{
  "url:abc123def456": "2026-04-17",
  "title:789xyz000aaa": "2026-04-15"
}
```

- Chave: string `"url:<hash>"` ou `"title:<hash>"`
- Valor: data ISO `YYYY-MM-DD` de quando o item foi visto pela primeira vez
- Sem arrays, sem metadados extras — lookup direto por chave

---

## 3. Geração de fingerprints

Cada item gera **dois fingerprints**, verificados em paralelo (lógica OR):

### 3a. URL hash
```js
url_key = "url:" + md5(normalize(item.link))
```
Usado quando `item.link` é não-vazio.

### 3b. Title hash
```js
title_key = "title:" + md5(normalize(item.title))
```
Sempre gerado.

### Normalização
```js
normalize(str) = str.toLowerCase().trim().replace(/\s+/g, " ")
```

### Regra de duplicidade (paralelo / OR)
Um item é duplicado se **qualquer uma** das chaves já existir no histórico:
```
isDuplicate = seenHashes[url_key] !== undefined
           || seenHashes[title_key] !== undefined
```

---

## 4. Momento da deduplicação

A verificação histórica ocorre **depois do cálculo de score e do filtro de relevância**, mas **antes de adicionar ao `collectedItems`**.

Fluxo por item:
```
1. Calcular score
2. Se score < 2 → [skip] (comportamento atual)
3. Aplicar filtro de data (since_hours)
4. Gerar url_key e title_key  ← novo
5. Se isDuplicate → [skip][dup] e continuar  ← novo
6. Adicionar ao collectedItems  ← novo
```

---

## 5. Log de duplicatas

Duplicatas detectadas são logadas de forma consistente com o padrão existente:

```
[skip][dup] score=4 "título do artigo truncado em 80 chars"
```

---

## 6. Atualização do histórico

Ao final de cada execução (passo 9, após `saveArtifact`):

1. Carregar `seen_hashes.json` (ou iniciar objeto vazio se não existir)
2. Para cada item em `finalItems`, adicionar `url_key` e `title_key` com a data de hoje
3. Salvar `seen_hashes.json` com o objeto atualizado

---

## 7. Ciclo de vida e limpeza

### 7a. Limpeza de entradas antigas (rolling window interno)
Ao carregar o arquivo de histórico, antes de usar, remover entradas com data mais velha que `keepDays` (7 dias):

```js
const cutoff = new Date(Date.now() - keepDays * 86400000)
  .toISOString().slice(0, 10); // "YYYY-MM-DD"

for (const [key, date] of Object.entries(seenHashes)) {
  if (date < cutoff) delete seenHashes[key];
}
```

### 7b. Limpeza do arquivo físico por created dat (COMENTADO)
O arquivo `seen_hashes.json` **não tem data no nome**, por isso o mecanismo de limpeza por regex de nome existente não o cobre.
Um segundo mecanismo é adicionado na etapa de cleanup, usando `fs.stat` para verificar `birthtime`:

```js
const stat = fs.statSync(seenHashesPath);
const ageInDays = (now - stat.birthtime) / (1000 * 60 * 60 * 24);
if (ageInDays > keepDays) {
  fs.unlinkSync(seenHashesPath);
  console.log("Deleted old seen_hashes.json (created > 7 days ago)");
}
```

> **Nota:** O mecanismo de deleção física do arquivo `seen_hashes.json` por idade (`birthtime`) foi removido.
> 
> **Motivo:** A limpeza interna (rolling window, item 7a) já garante que o arquivo nunca cresce indefinidamente, pois entradas mais velhas que `keepDays` são removidas automaticamente ao carregar o histórico.
> 
> Se o mecanismo removido fosse executado, ele apagaria todo o arquivo de histórico, fazendo com que, temporariamente, artigos já vistos nos últimos dias voltassem a aparecer como novos (duplicatas), até que o histórico fosse reconstruído nas execuções seguintes.
> 
> Portanto, manter apenas a limpeza interna é suficiente e mais seguro para evitar perda abrupta da memória de deduplicação.


> **Nota**: `birthtime` pode ser igual a `mtime` em alguns sistemas Linux que não preservam `ctime` como data de criação. Essa é uma salvaguarda de último recurso — a limpeza interna de entradas (7a) é o mecanismo primário.

### Prioridade de limpeza
1. **Primário**: limpeza interna de entradas velhas ao carregar o arquivo (7a)
2. **Secundário**: deleção física do arquivo por `birthtime` > 7 dias (7b)

---

## 8. Constantes

Todas as constantes de limpeza usam a mesma variável `keepDays = 7` já existente no código.
Nenhuma constante nova é introduzida.

---

## 9. Dependências

O MD5 pode ser implementado com `crypto` (nativo do Node.js), sem dependência nova:

```js
import crypto from "crypto";
const md5 = (str) => crypto.createHash("md5").update(str).digest("hex");
```

---

## 10. Resumo das mudanças no código

| Onde | O que muda |
|---|---|
| Imports | Adicionar `crypto` (nativo) |
| Nova função `loadSeenHashes()` | Carrega arquivo, purga entradas velhas, retorna objeto |
| Nova função `saveSeenHashes()` | Persiste objeto atualizado no arquivo |
| Nova função `isDuplicate()` | Recebe item + seenHashes, retorna bool + loga se dup |
| Passo 4 (fetch loop) | Após filtro de score/data, checar `isDuplicate` antes de push |
| Passo 9 (após saveArtifact) | Chamar `saveSeenHashes` com os fingerprints de `finalItems` |
| Passo 10 (cleanup) | Adicionar verificação por `birthtime` do `seen_hashes.json` |
