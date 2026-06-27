# Scoring e Seleção de Itens — rss-fetcher

Explica o checkpoint **`rank_select`** e o pipeline de pontuação que leva até ele.

---

## O que o checkpoint mostra

```json
{ "selected": 0, "max_items": 20, "top_score": null }
```

| Campo       | Significado                                                              |
| ----------- | ------------------------------------------------------------------------ |
| `selected`  | Itens que sobreviveram a **todos** os filtros e serão salvos no artifact |
| `max_items` | Teto configurado via input `max_items` (default 20)                      |
| `top_score` | Score do item mais relevante; `null` quando `selected = 0`               |

`selected: 0` não é erro — significa que nenhum item passou pelos filtros desta execução.

---

## Pipeline completo (do fetch ao rank_select)

Cada item passa por **4 eliminações em série** antes de chegar ao `rank_select`:

```
[feed RSS/scraper]
      │
      ▼
① Score mínimo                 ← descarta sem padrão
      │
      ▼
② Corte por data (since_hours) ← descarta muito antigos
      │
      ▼
③ Dedup cross-execução         ← descarta já vistos (seenHashes)
      │
      ▼
④ Dedup intra-execução         ← descarta duplicatas desta rodada
      │
      ▼
[rank_select] corta em max_items, ordena
```

---

## ① Como o score é calculado

O score é calculado **por título** (em lowercase, sem HTML):

```
Para cada padrão em topicPatterns:
  se título contém a frase exata   → +2 × 2 = +4
  se contém todas as palavras      → +4
  + se palavras estão próximas (janela de 8) → +1 bônus

Para cada padrão em excludePatterns:
  se título bate                   → -2
```

**Score mínimo para entrar:**

- Feeds normais: `score >= 2` (precisa bater ao menos um padrão)
- Feeds com `pass_through: true` (Product Hunt, Bootstrapped Founder, Failory): `score >= 0` (passa tudo que não foi excluído)

**Causa mais comum de `selected: 0`:** nenhum título dos feeds bateu nos `patterns` configurados, ou todos foram penalizados pelos `exclude_patterns`.

---

## ② Corte por data (`since_hours`)

Se `since_hours > 0`, itens com `published` anterior ao corte são descartados.  
`since_hours = 0` (default) desabilita o corte — itens sem data passam.

---

## ③ Dedup cross-execução (seenHashes)

Cada execução grava os fingerprints dos itens selecionados em `seen_hashes-<group>.json`.  
Nas próximas execuções, um item é descartado se:

- Fingerprint **exato** já existe, **ou**
- Similaridade de Jaccard entre os fingerprints >= 0.7 (títulos quasi-idênticos)

O fingerprint é calculado assim:

1. Remove sufixo de fonte (`"... - Exame"` → remove `"- Exame"`)
2. Tokeniza, remove stop-words PT-BR
3. Aplica Metaphone PT-BR em cada token
4. Ordena e junta com `-`

Isso faz o dedup funcionar mesmo com pequenas variações de wording.  
Entradas expiram após 7 dias (`keepDays`).

**Causa de `selected: 0` após execuções seguidas:** todos os itens relevantes já foram vistos nos últimos 7 dias — os feeds não publicaram nada novo que bata nos padrões.

---

## ④ Dedup intra-execução

Dentro da mesma execução, dois itens de feeds diferentes com o mesmo fingerprint (Jaccard >= 0.7) são colapsados — o primeiro vence. Reduz duplicatas quando a mesma notícia aparece em múltiplos feeds.

---

## Checklist de diagnóstico para `selected: 0`

Veja o checkpoint `fetch_feeds` na mesma execução:

```json
{ "feeds_attempted": 15, "feeds_failed": 2, "feeds_bad": 3, "collected": 0 }
```

| Sintoma                           | Causa provável                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------- |
| `collected: 0`                    | Nenhum feed retornou item com score >= 2 — padrões muito estritos ou feeds sem conteúdo relevante |
| `collected > 0` mas `selected: 0` | Os itens coletados foram eliminados pelo dedup (seenHashes) — já foram vistos                     |
| `feeds_bad > 0`                   | Feeds com URL inválida/HTML — aparecem na seção "Feeds com problema" do dashboard                 |
| `feeds_failed > 0`                | Timeout ou erro de rede — transitório, pode tentar de novo                                        |

**Para aumentar a coleta:**

- Amplie `patterns` (adicione sinônimos separados por `;`)
- Reduza `exclude_patterns`
- Aumente `since_hours` (ou deixe 0 para sem corte de data)
- Adicione feeds novos ao `feeds-radar-saas.js`
- Reduza `max_items` para não esgotar a cota rápido
