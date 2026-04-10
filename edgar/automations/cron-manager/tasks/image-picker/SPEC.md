# 📄 **SPEC.md — select-hero-image**

## 🎯 Objetivo

Selecionar automaticamente uma imagem hero relevante para um artigo usando múltiplas APIs externas, com heurística determinística (sem uso de IA), garantindo boa qualidade visual e aderência semântica ao conteúdo.

---

## 📥 Input

```ts
type ImageHints = {
  searchQueries: string[];
  suggestedAlt?: string;
};
```

### Exemplo

```json
{
  "searchQueries": [
    "torcedores brasileiros Fifa Pass Copa do Mundo 2026",
    "formulário DS-160 visto americano com Fifa Pass",
    "cidades EUA Copa do Mundo 2026 mapa"
  ],
  "suggestedAlt": "Brasileiros usando Fifa Pass para visto da Copa 2026 nos EUA"
}
```

---

## 📤 Output

```ts
type HeroImageResult = {
  url: string | null;
  alt?: string;
};
```

---

## 🌐 Fontes de Imagem

A busca deve ser feita nas seguintes APIs:

- Pexels
- Pixabay
- Unsplash

### Regras

- Executar buscas em paralelo
- Timeout recomendado: ~2s por API
- Falhas individuais não interrompem o fluxo

---

## 🔎 Fluxo

### 1. Preparação das Queries

- Usar `imageHints.searchQueries`
- Limite recomendado: **máx 3 queries**
- Fallback futuro possível: `title`

---

### 2. Busca Multi-Source

Para cada query:

- Executar buscas nas 3 APIs em paralelo
- Limitar ~10 imagens por API

Total esperado:

- até ~90 imagens

---

### 3. Normalização

Todas as APIs devem retornar dados no formato comum:

```ts
type ImageCandidate = {
  url: string;
  width: number;
  height: number;
  source: "pexels" | "pixabay" | "unsplash";
  alt?: string;
  description?: string;
};
```

---

### 4. Deduplicação

- Remover imagens duplicadas por `url`

---

# 🧠 Heurística de Seleção (sem IA)

## 🔤 4.1 Normalização de texto

- lowercase
- remover acentos
- remover pontuação

---

## 🚫 4.2 Stopwords

Remover palavras comuns (PT + EN)

---

## ✂️ 4.3 Tokenização

- split por espaço
- remover palavras irrelevantes
- ignorar palavras curtas

---

## 🌱 4.4 Stemming leve

Remover sufixos comuns:

- inglês: `ing`, `ed`, `s`
- português: `s`, `es`, `ns`

---

## 🔗 4.5 Similaridade

Baseada em interseção de tokens

---

# 📊 Score da Imagem

```ts
score = relevance_score + resolution_score + aspect_ratio_score + orientation_score - penalties;
```

---

## 🔍 1. Relevância (0–10)

- match com `searchQueries` → +2 por match
- múltiplos matches → acumulativo
- match com `suggestedAlt` → +3

### Boost adicional

- +0.5 por palavras raras (len > 6)

---

## 📐 2. Resolução (0–3)

- ≥1920px → +3
- ≥1280px → +2
- menor → +1

---

## 📏 3. Aspect Ratio (0–2)

- ~16:9 → +2
- ~4:3 → +1
- outros → 0

---

## 🧭 4. Orientação (0–2)

- landscape → +2
- square → +1
- portrait → 0

---

## ⚠️ Penalizações

- largura <800px → -3
- sem metadata → -1

---

## 🏆 Seleção Final

- ordenar por `score DESC`
- selecionar a melhor imagem

---

## 🔁 Fallback

### Condição

```ts
!best || best.score < 5;
```

### Comportamento atual

```ts
return {
  url: null,
  alt: suggestedAlt,
};
```

---

### Infra futura

```ts
fallback_images: string[]
```

Possibilidades futuras:

- por categoria
- aleatório
- baseado em keywords

---

## 🧩 Output final

```json
{
  "url": "https://...",
  "alt": "..."
}
```

### Regras

- `alt` = `suggestedAlt` (se existir)
- não gerar alt automaticamente

---

## ⚙️ Considerações Técnicas

- usar `Promise.allSettled`
- não falhar se uma API cair
- limitar volume de requests
- preparar cache futuro
- logging opcional de score

---

# 🧱 Organização com Adapters

## Objetivo

Separar integração com cada API da lógica principal, mantendo o sistema modular, testável e fácil de evoluir.

---

## Estrutura sugerida

```
/adapters
  pexels.ts
  pixabay.ts
  unsplash.ts

/core
  scoring.ts
  text-processing.ts

/service
  selectHeroImage.ts
```

---

## Responsabilidades

### Adapters (por API)

- fazer request HTTP
- tratar autenticação
- mapear resposta da API
- retornar já normalizado (`ImageCandidate[]`)

---

### Core

- tokenização
- stemming
- cálculo de score
- heurística

---

### Service

- orquestração geral
- agregação de resultados
- deduplicação
- seleção final

---

## Benefícios

- isolamento de diferenças entre APIs
- facilidade para adicionar/remover fontes
- controle de rate limit por API
- melhor testabilidade
- menor acoplamento

---

## 🔄 Fluxo Final Consolidado

```txt
input (imageHints)
   ↓
buscar imagens (adapters)
   ↓
normalizar
   ↓
deduplicar
   ↓
processar texto (tokenize/stem)
   ↓
calcular score
   ↓
ordenar
   ↓
selecionar melhor
   ↓
fallback (se necessário)
   ↓
output final
```

---

## ✅ Resultado Esperado

- seleção automática consistente
- alta relevância semântica
- boa qualidade visual
- resiliente a falhas externas
- sem dependência de IA
- pronto para escalar

---

## 🚀 Evoluções Futuras

- TF-IDF leve
- dicionário de sinônimos
- cache por query
- ranking baseado em CTR
- fallback inteligente por categoria
