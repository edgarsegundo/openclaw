# SPEC: Suporte a Feeds Scraper no rss-fetcher

## Objetivo

Permitir que o rss-fetcher colete notícias de páginas web que não possuem RSS, usando scraping
de HTML estático. Os itens coletados entram no pipeline padrão de filtragem, deduplicação e score
sem nenhuma alteração no restante do fluxo.

---

## 1. Novo campo `type` no objeto de feed

Cada feed agora pode declarar seu tipo com o campo `type`:

| Valor      | Comportamento                        |
|------------|--------------------------------------|
| `"rss"`    | Padrão atual — usa `rss-parser`      |
| `"scraper"`| Novo — faz download e parse de HTML  |

Se `type` for omitido, assume `"rss"` (retrocompatível).

---

## 2. Novo campo `scrap_layout_tips` (opcional)

Presente apenas em feeds do tipo `scraper`. Permite que o humano passe dicas simples de layout
inspecionando rapidamente o HTML da página, sem necessidade de conhecimento técnico avançado.

```js
{
  url: "https://g1.globo.com/tudo-sobre/walt-disney-world/",
  name: "G1 - Walt Disney World",
  lang: "pt",
  category: "general",
  type: "scraper",
  scrap_layout_tips: {
    link_selector: "a.feed-post-link",   // seletor CSS do <a> que representa cada artigo
    title_selector: "h3.card-title",     // opcional — só quando o título está FORA do <a>
  }
}
```

Ambos os campos de `scrap_layout_tips` são **opcionais**:

- **`link_selector`** — seletor CSS do elemento `<a>` de cada artigo. Quando presente, o scraper
  usa apenas esses links (modo preciso). Quando ausente, entra em modo heurístico genérico
  (modo permissivo — mais ruído, filtrado pelo score).
- **`title_selector`** — seletor CSS do elemento que contém o título, buscado no container pai
  do `<a>`. Usar apenas quando o título não está dentro do próprio `<a>`. Quando ausente, usa
  `textContent` do `<a>`.

---

## 3. Lógica do scraper (`fetchFromScraper`)

### 3.1 robots.txt

Antes de fazer o download da página, o scraper verifica o `robots.txt` do domínio. Se o caminho
da URL estiver bloqueado para user-agents genéricos, o feed é pulado com log de aviso:

```
[scraper][robots] SKIP https://exemplo.com/noticias/ — bloqueado por robots.txt
```

### 3.2 Download

- User-Agent: simula browser real (`Mozilla/5.0 ... Chrome/...`)
- Timeout: 15 segundos
- Sem cache — cada execução busca HTML fresco

### 3.3 Extração de links e títulos

**Modo com `link_selector` (preciso):**

1. Seleciona todos os `<a>` via `link_selector`
2. Para cada `<a>`:
   - **Título:** se `title_selector` definido → busca no container pai mais próximo; senão → `textContent` do `<a>`
   - **Link:** `href` do `<a>`, normalizado para URL absoluta

**Modo sem `link_selector` (heurístico genérico / permissivo):**

Percorre todos os `<a>` da página e considera candidatos aqueles que passam em pelo menos 2
dos seguintes critérios heurísticos:

| Critério | Descrição |
|---|---|
| Texto longo | `textContent` com 20–200 caracteres |
| URL de artigo | href contém padrão de slug: data (`/2024/`), segmentos longos, extensão `.html`/`.ghtml` |
| Container semântico | `<a>` está dentro de `<article>`, `<main>`, `<section>`, `.feed`, `.card`, `.post` |
| Não é navegação | href não contém `/tag/`, `/autor/`, `/categoria/`, `#`, `mailto:`, `javascript:` |

O título é o `textContent` do `<a>` limpo.

### 3.4 Normalização de URL

- Links relativos (ex: `/noticia/123`) são convertidos para absolutos usando a origem do `feed.url`
- Links de outros domínios são descartados

### 3.5 Título — estratégia de extração em cascata

1. `textContent` do elemento selecionado (limpo de tags e espaços extras)
2. Se vazio ou < 10 caracteres → humanizar slug da URL (ex: `pato-donald-descubra-de-quem` → `Pato Donald Descubra De Quem`)
3. Se ainda inválido → descartar o item

### 3.6 `published`

Scrapers não extraem data de publicação. O campo `published` é sempre preenchido com a data
atual (ISO 8601, início do dia), garantindo que o filtro `since_hours` e a ordenação funcionem.

---

## 4. Delay entre scrapers

Para evitar ban por rate limiting, há um delay aleatório entre cada requisição de scraping:

- **Intervalo:** entre 1.5s e 4s (gerado aleatoriamente a cada requisição)
- Feeds RSS não são afetados (sem delay)

---

## 5. Interface dos itens retornados

Os itens do scraper seguem exatamente o mesmo formato do RSS para que o restante do pipeline
não precise de alterações:

```js
{
  title: "Pato Donald: descubra de quem é a voz...",
  link: "https://g1.globo.com/fantastico/noticia/2024/06/09/pato-donald...",
  published: "2025-04-20T00:00:00.000Z",  // data de hoje
  source: "G1 - Walt Disney World",
  source_url: "https://g1.globo.com/tudo-sobre/walt-disney-world/",
  language: "pt",
  category: "general",
  score: <calculado pelo pipeline padrão>,
  fetched_at_item: "<ISO timestamp>"
}
```

> `summary` foi removido da spec — não é necessário pois uma IA reescreve o artigo.

---

## 6. Logs

```
[scraper] Fetching: G1 - Walt Disney World (modo: preciso, selector: a.feed-post-link)
[scraper] 34 candidatos encontrados, 8 com título válido.
[scraper][robots] SKIP https://exemplo.com/ — bloqueado por robots.txt
[scraper][warn] Feed "XYZ" retornou 0 itens — verifique o layout ou o link_selector.
[scraper][error] Feed "XYZ" falhou: <mensagem>
```

---

## 7. Dependências

- `cheerio` — parsing de HTML estático (leve, sem JS rendering)
- Nenhuma dependência nova para robots.txt — parsing manual do arquivo texto

---

## 8. Retrocompatibilidade

- Feeds sem `type` continuam funcionando como RSS
- Nenhuma alteração nas etapas 6–12 do pipeline (dedup, score, artifact, seen_hashes)
- O campo `summary` é omitido apenas para itens scraper; itens RSS continuam enviando summary normalmente

---

## 9. Exemplo de feed scraper em `feeds.js`

```js
{
  url: "https://g1.globo.com/tudo-sobre/walt-disney-world/",
  name: "G1 - Walt Disney World",
  lang: "pt",
  category: "general",
  type: "scraper",
  scrap_layout_tips: {
    link_selector: "a.feed-post-link",
  }
}
```

---

## 10. Não está no escopo

- JavaScript rendering (Puppeteer/Playwright)
- Paginação
- Cache de HTML
- Seletores automáticos / ML
