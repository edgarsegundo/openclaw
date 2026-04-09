Perfeito! Vou criar **um esquema visual do pipeline completo** e, em seguida, **uma spec consolidada em Markdown** pronta para futuras melhorias.

---

## 🖼️ Pipeline Visual Completo

```txt
                  ┌───────────────────────┐
                  │     Article Prompt     │
                  │  (title, slug, etc.)  │
                  └─────────┬─────────────┘
                            │
                            ▼
                 ┌───────────────────────┐
                 │        LLM JSON       │
                 │  markdown, faq, image │
                 └─────────┬─────────────┘
                            │
            ┌───────────────┴───────────────┐
            │                               │
            ▼                               ▼
 ┌─────────────────────┐         ┌─────────────────────┐
 │  Pós-Validação      │         │  Retry Inteligente  │
 │ - valida tipos      │         │ - corrige campos    │
 │ - placeholders      │         │   incompletos       │
 │ - tamanho/quantidade│         │                     │
 └─────────┬───────────┘         └─────────┬───────────┘
           │                               │
           └───────────┬───────────────────┘
                       ▼
             ┌─────────────────────┐
             │  Score Semântico    │
             │ - FAQ               │
             │ - ImageHints        │
             │ - Conteúdo geral    │
             └─────────┬───────────┘
                       │
                       ▼
             ┌─────────────────────┐
             │ Output Final JSON   │
             │ - markdownText      │
             │ - faq               │
             │ - imageHints        │
             └─────────┬───────────┘
                       │
                       ▼
             ┌─────────────────────┐
             │  Astro Frontmatter  │
             │  + Pipeline de      │
             │    Imagem           │
             └─────────────────────┘
```

---

## 📝 Spec Consolidada – Artigos de Vistos com Pipeline Inteligente

````md
# Spec de Geração de Artigos com Pós-Validação, Retry e Score Semântico

## Objetivo

Gerar artigos completos sobre vistos internacionais com:

- Conteúdo passo a passo
- FAQ estruturado
- Sugestões de imagens editoriais
- Links internos plausíveis
- Validação automática e retry inteligente
- Relevância semântica garantida

---

## INPUTS DINÂMICOS POR ARTIGO

- title: "Título do artigo"
- slug: "slug-artigo"
- language: "pt-BR"
- cluster.allSlugs: ["slug1", "slug2", "slug3"]

---

## REGRAS DO ARTIGO

- Estrutura narrativa sequencial
- Checklist e tabelas quando necessário
- Parágrafos curtos (máx. 3 linhas)
- 2–3 placeholders de imagem: `<!-- INSERIR IMAGEM -->`
- 2–3 placeholders de intervenção: `<!-- INTERVENCAO FUTURA -->`
- Links internos: 3–8 itens, formato [[LINK: slug | texto âncora]], distribuídos naturalmente
- FAQ não incluído no markdown

---

## FAQ ESTRUTURADO

- Array de 3–6 itens
- Cada item: `{ "question": "...", "answer": "..." }`
- Perguntas naturais e específicas
- Respostas curtas, claras e úteis
- Complementam dúvidas práticas, não apenas resumo
- Sem markdown

---

## IMAGE HINTS

- mainSubject: assunto visual principal concreto
- secondarySubject: elemento visual complementar
- visualStyle: estilo curto e objetivo (ex: clean editorial realistic)
- searchQueries: 3 consultas curtas com variação semântica
- suggestedAlt: texto alternativo SEO-friendly

---

## PÓS-VALIDAÇÃO

Validar JSON completo usando `zod` ou equivalente:

- title, slug, seoMetaDescription, markdownText
- faq: 3–6 itens
- imageHints: todos os campos preenchidos
- placeholders corretos

---

## RETRY INTELIGENTE

- Identificar campos inválidos ou incompletos
- Gerar prompt restrito apenas para esses campos
- Substituir conteúdo no JSON sem refazer tudo

---

## SCORE SEMÂNTICO

- Gerar embeddings do artigo
- Comparar faq.question e imageHints.searchQueries
- Score de relevância (0–1)
- Thresholds:
  - FAQ < 0.7 → retry FAQ
  - imageHints < 0.75 → retry/fallback generativo

---

## OUTPUT FINAL

```json
{
  "title": "Título do artigo (40–70 caracteres)",
  "slug": "{{slug}}",
  "seoMetaDescription": "Meta descrição SEO (120–160 caracteres)",
  "keywords": ["keyword1", "keyword2"],
  "markdownText": "CONTEÚDO COMPLETO EM MARKDOWN",
  "faq": [
    { "question": "...", "answer": "..." }
  ],
  "imageHints": {
    "mainSubject": "...",
    "secondarySubject": "...",
    "visualStyle": "...",
    "searchQueries": ["...", "...", "..."],
    "suggestedAlt": "..."
  }
}
````

* JSON pronto para injeção no Astro frontmatter
* Pipeline de imagem integrado
* Retry e pós-validação aplicados

---

## FUTURAS MELHORIAS

* Deduplicação de imagens
* Score de consistência visual entre artigos
* Cache local otimizado para artigos de alto tráfego
* Geração de fallback editorial quando searchQueries falharem

```

---
