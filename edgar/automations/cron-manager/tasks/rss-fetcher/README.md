# [rss-fetcher](https://claude.ai/chat/c756e573-2198-4dcb-b670-7465deb68e1c)

Task responsável pela **Fase 1** da automação de blog: buscar notícias em feeds RSS filtradas por assunto e salvar um artifact estruturado para ser consumido pela próxima task (escritora de artigos).

---

## O que essa task faz

1. Recebe um `topic` (assunto) como input
2. Busca artigos em todos os feeds RSS configurados
3. Filtra apenas os itens que contêm as palavras-chave do topic
4. Ordena por data (mais recente primeiro)
5. Salva o resultado em `raw_news.json` como artifact

---

## Inputs

| Input | Tipo | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|
| `topic` | string | ✅ | — | Assunto a buscar (ex: "inteligencia artificial") |
| `feeds` | string | ❌ | `""` | URLs RSS separadas por vírgula. Se vazio, usa lista padrão |
| `max_items` | number | ❌ | `10` | Máximo de itens a coletar no total |
| `language` | string | ❌ | `"pt"` | Idioma preferido para filtrar feeds padrão (`pt`, `en`, `es`) |

---

## Como rodar

```bash
# Na raiz do cron-manager:

# Instalar dependência (só na primeira vez)
cd tasks/rss-fetcher && npm install && cd ../..

# Rodar interativamente
node bin/cron-manager.js run rss-fetcher

# Ver artifact gerado
node bin/cron-manager.js list-artifacts
```

---

## Artifact gerado: `raw_news.json`

```json
{
  "topic": "inteligencia artificial",
  "language": "pt",
  "fetched_at": "2026-04-08T12:00:00.000Z",
  "total_feeds_attempted": 8,
  "total_feeds_failed": 0,
  "total_items_collected": 7,
  "items": [
    {
      "title": "IA avança em diagnósticos médicos",
      "link": "https://...",
      "published": "2026-04-08T10:30:00Z",
      "summary": "Pesquisadores desenvolveram...",
      "source": "Tecnoblog",
      "source_url": "https://tecnoblog.net/feed/",
      "language": "pt",
      "category": "technology"
    }
  ]
}
```

---

## Adicionando novos feeds

Edite o arquivo `feeds.js` e adicione entradas ao array `DEFAULT_FEEDS`:

```js
{
  url: "https://seusite.com.br/feed/",
  name: "Nome do Portal",
  lang: "pt",          // pt | en | es
  category: "technology" // general | technology | finance | business | custom
}
```

---

## Próxima etapa (Fase 2)

Crie a task `article-writer` que consome o artifact `raw_news.json` desta task e usa a API de IA para gerar o rascunho do artigo do blog.
