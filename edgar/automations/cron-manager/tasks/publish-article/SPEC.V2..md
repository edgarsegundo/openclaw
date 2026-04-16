# publish-article — Spec de Refatoração

## Contexto

A task `publish-article` opera em **duas partes**:

- **Parte 1** (fluxo atual — não muda): pega o artigo `.json` mais antigo da pasta,
  faz POST na API do banco de dados, move os arquivos para `published/`.
- **Parte 2** (novo): executa ping do sitemap + Google Indexing API para o artigo
  escolhido pelo usuário via Discord.

As duas partes são independentes e separadas no tempo. A part 1 roda via cron
automaticamente. A parte 2 roda quando o usuário envia `.pub N` via Discord.

---

## Fluxo completo

### Execução normal (cron, sem `action`/`item_index`)

1. Executa a **Parte 1** exatamente como hoje (sem mudanças).
2. Ao final, lê todos os arquivos `.json` do dia em `published/`
   (filtrado por `mtime` — arquivos do dia corrente).
3. Envia lista via Discord:
   - Arquivos com `mtime` nos últimos 10 minutos → destacados como 🆕
   - Demais arquivos do dia → listados normalmente
   - Formato: `[N] slug-do-artigo` (índice 0-based)
4. Encerra.

### Execução com comando manual (`action=pub`, `item_index=N`)

1. **Não executa a Parte 1.**
2. Lê todos os arquivos `.json` do dia em `published/` (mesma lista que o Discord mostrou).
3. Valida que o índice N existe.
4. Executa a **Parte 2** no artigo correspondente:
   - Ping do sitemap
   - Google Indexing API
5. Notifica Discord com resultado (sucesso ou falha).
6. Encerra.

---

## Inputs da task

| Input | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `articles_dir` | string | sim | Pasta com artigos gerados, ex: `artifacts/write-article/visto-americano` |
| `destinations` | array | sim | `[{ business_id, blog_topic_slug }]` — round-robin para Parte 1 |
| `sitemap_url` | string | sim | URL do sitemap, ex: `https://seudominio.com/sitemap.xml` |
| `action` | string | não | `"pub"` — comando manual |
| `item_index` | number | não | Índice 0-based do artigo na lista do Discord |

---

## Env vars

| Var | Descrição |
|---|---|
| `MYSITESAPP_API_KEY` / `x-api-key` | Chave para o POST da Parte 1 (existente) |
| `GOOGLE_APPLICATION_CREDENTIALS` | Caminho para o JSON da Service Account Google |

---

## Lista do Discord

### Quando enviada
Ao final de toda execução normal (cron), após a Parte 1.

### Como construir a lista
```
published/*.json
  → filtrar por mtime no dia corrente (meia-noite até agora)
  → ordenar por mtime ASC
  → indexar 0-based
```

### Formato da mensagem
```
📰 Artigos publicados hoje — "visto-americano":
> .pub <N> para indexar no Google

🆕 [0] como-tirar-visto-americano-2025-04-15
🆕 [1] visto-americano-para-estudantes-2025-04-15
    [2] tipos-de-visto-americano-2025-04-15
```

- 🆕 = `mtime` nos últimos 10 minutos (recém movido nessa execução)
- Sem 🆕 = arquivo do dia mas de execução anterior
- Se a lista ultrapassar 2000 caracteres, dividir em múltiplas mensagens
  (mesma lógica `sendInChunks` do rss-picker)
- Se não houver nenhum arquivo do dia em `published/`, não envia mensagem

---

## Parte 2 — Indexação no Google

### Módulo separado
Criar `google-indexing.js` no mesmo diretório do `index.js`.

### Ping do sitemap
```
GET https://www.google.com/ping?sitemap=<SITEMAP_URL_ENCODED>
```
- Timeout: 5s
- Retry: até 2 tentativas (backoff exponencial: 1s, 2s)
- Log de sucesso ou erro
- Falha não bloqueia a Indexing API

### Google Indexing API
- Biblioteca: `googleapis`
- Autenticação: Service Account via `GOOGLE_APPLICATION_CREDENTIALS`
- Scope: `https://www.googleapis.com/auth/indexing`
- Endpoint: `POST https://indexing.googleapis.com/v3/urlNotifications:publish`
- Body:
  ```json
  { "url": "https://example.com/slug", "type": "URL_UPDATED" }
  ```
- A URL a ser indexada deve ser construída a partir do `slug` do artigo
  (campo `slug` dentro do `.json`, ou nome do arquivo sem data e extensão)
- Retry: 2 tentativas por falha
- Log detalhado de erro (`response.data`)

### Notificação Discord após Parte 2
Sucesso:
```
✅ Indexação concluída para: como-tirar-visto-americano
   Sitemap pingado: ✅
   Indexing API: ✅
```
Falha parcial:
```
⚠️ Indexação com erros para: como-tirar-visto-americano
   Sitemap pingado: ✅
   Indexing API: ❌ (erro: <mensagem>)
```

---

## Detecção de "recém chegados"

```js
const TEN_MINUTES_MS = 10 * 60 * 1000;
const isNew = (Date.now() - stat.mtimeMs) < TEN_MINUTES_MS;
```

---

## Estrutura de arquivos

```
publish-article/
  ├── index.js           ← refatorado (orquestra tudo)
  └── google-indexing.js ← módulo novo (ping + Indexing API)
```

---

## O que NÃO muda

- Lógica da Parte 1 (POST, move arquivos, round-robin, `publish-article.roundrobin.json`)
- Limpeza de arquivos antigos (`cleanOldFiles`)
- Validação de inputs e campos obrigatórios do JSON
