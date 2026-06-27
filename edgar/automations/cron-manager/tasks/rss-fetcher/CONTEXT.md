# rss-fetcher — contexto para debug

## O que faz

Busca feeds RSS e scraper, filtra por tópico, deduplicata por fingerprint de título (Jaccard + Metaphone PT-BR) e salva os itens relevantes em:
`artifacts/rss-fetcher/fetched-items-{group}-{YYYY-MM-DD}.json`

## Arquivos principais

- `tasks/rss-fetcher/index.js` — lógica principal
- `tasks/rss-fetcher/feeds-{group}.js` — lista de feeds por grupo (ex: `feeds-visto-americano.js`)
- `tasks/rss-fetcher/inputs/inputs-{group}.json` — inputs da task (topic, group, etc.)
- `lib/url.js` — `extractRealUrl()` (desembrulha redirect Google Alerts), `itemIdFromUrl()` (sha1 12 chars)
- `lib/atomic.js` — `writeFileAtomicSync()` (write em .tmp → rename)
- `lib/tracker.js` — `track()` best-effort para SQLite (nunca quebra o pipeline)

## Fluxo

1. Carrega feeds do `feeds-{group}.js`
2. Para cada feed: fetch HTTP → `sanitizeXml()` → `rssParser.parseString()` (RSS) ou cheerio (scraper)
3. Filtra por topic patterns, data, Jaccard similarity (threshold 0.7)
4. Salva `seen_hashes-{group}.json` (dedup cross-run) e o artifact JSON

## Mudanças recentes relevantes

- `sanitizeXml()` adicionada: corrige `&` solto e atributos booleanos HTML (`<img loading>` → `<img loading="">`) antes do parse XML
- Trocado `rssParser.parseURL()` por fetch manual + `rssParser.parseString(sanitizeXml(rawXml))` para ter acesso ao XML bruto
- Erros de feed capturados e gravados no banco via `context.track()` com `meta: { feed, url }`
- `writeFileAtomicSync` em vez de `fs.writeFileSync` para seen_hashes e artifact

## Erros conhecidos / já tratados

- `Invalid character in entity name` → corrigido por `sanitizeXml()` (bare `&`)
- `Attribute without value` → corrigido por `sanitizeXml()` (boolean attrs HTML)
- `Invalid character in tag name` (Char: `;`) → corrigido por `sanitizeXml()`: strips `<script>`/`<style>` (JS/CSS com operadores `<`) e converte `<word;` ou `< word;` em `&lt;word;` (nunca é nome de tag XML válido)
- Todos aparecem no dashboard em `Erros recentes` com o nome do feed na coluna Feed/URL

## Como rodar

```bash
cd edgar/automations/cron-manager
node cron-manager.js run rss-fetcher --input-file tasks/rss-fetcher/inputs/inputs-visto-americano.json
```

## Schema do artifact de saída

```json
{
  "group": "visto-americano",
  "date": "2026-06-27",
  "total_feeds_attempted": 15,
  "results": [
    {
      "item_id": "abc123def456",
      "title": "...",
      "link": "https://...",
      "published": "2026-06-27T10:00:00Z",
      "source": "Google Alerts - Visto Americano",
      "score": 3
    }
  ]
}
```
