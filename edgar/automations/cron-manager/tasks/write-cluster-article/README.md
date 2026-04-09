# 🧠 VISÃO GERAL (ARQUITETURA FINAL)

```id="arch"
[Task 1] Cluster
      ↓
[Task 2] Article Generator (loop)
      ↓
[Task 3] Link Parser (local, sem IA)
      ↓
[Task 4] Final Output
```

👉 Tudo síncrono, cada etapa bem isolada.

---

# 🧩 TASK 1 — CLUSTER GENERATION

## 🎯 Objetivo

Gerar a estrutura do conteúdo (pilar + satélites)

---

## 📥 Input

```json id="cluster_input"
{
  "topic": "string",
  "language": "string"
}
```

---

## 📤 Output

```json id="cluster_output"
{
  "pillar": {
    "title": "",
    "slug": "",
    "keyword": "",
    "intent": ""
  },
  "satellites": [
    {
      "title": "",
      "slug": "",
      "keyword": "",
      "intent": ""
    }
  ]
}
```

---

## 📌 Regras

- slugs devem ser:
  - lowercase
  - separados por hífen
  - sem acento

- evitar duplicidade
- garantir relação semântica com o tópico

---

## 🧠 Prompt esperado

- foco em SEO + cobertura de tópico
- NÃO gerar conteúdo ainda

---

# 🧩 TASK 2 — ARTICLE GENERATION

## 🎯 Objetivo

Gerar 1 artigo completo por execução

---

## 📥 Input

```json id="article_input"
{
  "title": "",
  "slug": "",
  "keyword": "",
  "intent": "",
  "language": "",
  "cluster": {
    "allSlugs": []
  }
}
```

---

## 📤 Output

```json id="article_output"
{
  "title": "",
  "slug": "",
  "seoMetaDescription": "",
  "keywords": [],
  "markdown": ""
}
```

---

## 📌 Regras obrigatórias

### 🔗 LINKS INTERNOS (CRÍTICO)

O conteúdo DEVE conter placeholders:

```id="link_format"
[[LINK: slug | texto âncora]]
```

---

### Regras de uso:

- 3 a 8 links por artigo
- usar apenas slugs plausíveis
- preferir slugs do cluster (`allSlugs`)
- texto âncora natural
- não quebrar fluidez

---

## 🖼️ IMAGENS

```html id="img_placeholder"
<!-- INSERIR IMAGEM: descrição -->
```

---

## 🧪 INTERVENÇÕES

```md id="interv_placeholder"
<!-- INTERVENCAO FUTURA: tipo — sugestão -->
```

---

## 🧠 Estrutura

- narrativa passo a passo
- checklist
- FAQ
- tabela quando necessário

---

# 🧩 TASK 3 — LINK PARSER (SEM IA)

## 🎯 Objetivo

Transformar placeholders em links reais

---

## 📥 Input

```json id="parser_input"
{
  "articles": [
    {
      "slug": "",
      "markdown": ""
    }
  ]
}
```

---

## ⚙️ Etapas

### 1. Criar mapa de slugs

```id="slug_map_example"
{
  "documentos-visto-americano": "/visto-americano/documentos"
}
```

---

### 2. Regex

```id="regex_link"
\[\[LINK: (.*?) \| (.*?)\]\]
```

---

### 3. Substituição

```id="replace_logic"
[[LINK: slug | texto]]
↓
<a href="/slug">texto</a>
```

---

## ⚠️ Edge cases

- slug não encontrado:
  - ignorar OU
  - manter texto sem link

- slug duplicado:
  - ok

- evitar múltiplos links seguidos

---

# 🧩 TASK 4 — FINAL OUTPUT

## 🎯 Objetivo

Retornar tudo pronto pra uso

---

## 📤 Output final

```json id="final_output"
{
  "cluster": {...},
  "articles": [
    {
      "title": "",
      "slug": "",
      "html": "",
      "markdown": ""
    }
  ]
}
```

---

# 🧠 REGRAS GLOBAIS

## 🔒 Consistência

- slugs devem bater entre tasks
- keywords coerentes
- linguagem consistente

---

## 💡 SEO

- evitar duplicação de conteúdo
- garantir complementaridade entre artigos
- usar variações semânticas

---

## ⚠️ Confiabilidade

- não inventar dados
- indicar que regras podem mudar
- evitar linguagem absoluta

---

# 🚀 EXECUÇÃO FINAL (SIMPLES)

```id="execution"
cluster = generateCluster(topic)

articles = []

for item in cluster:
    article = generateArticle(item, cluster.allSlugs)
    articles.append(article)

finalArticles = parseLinks(articles)

return {
  cluster,
  articles: finalArticles
}
```

---

# 🎯 O que você ganhou com isso

- zero dependência de IA pra interlink ✅
- previsibilidade total ✅
- custo menor ✅
- arquitetura simples ✅

---

# 💬 Se quiser evoluir depois

Dá pra adicionar:

- parser de links externos automático
- score de qualidade por artigo
- normalização de anchor text
- geração de HTML direto com headings SEO

Só falar que eu aprofundo 👍
