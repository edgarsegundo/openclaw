import { z } from "zod";

/**
 * Output schema for this prompt template.
 *
 * Two purposes:
 *   1. Sent to the API as `response_format: json_schema` — the API guarantees
 *      the response matches this shape. No text parsing needed.
 *   2. Zod validates the result as a final safety net after parsing.
 *
 * Rules:
 *   - Root MUST be z.object({}) — OpenAI requires an object at the top level.
 *   - Each field should have a clear counterpart in user.md so the AI knows
 *     what to put there. Field names guide the AI even without descriptions.
 *   - Use .nullable() for fields that may not always apply.
 *   - For free-text outputs (articles, reports), use a string field:
 *       content: z.string()   ← full markdown text goes here
 *     Add structured metadata fields alongside it (title, tags, summary, etc.)
 *
 * Examples by use case:
 *
 *   Structured data (analysis, extraction):
 *     z.object({
 *       title:      z.string(),
 *       summary:    z.string(),
 *       tags:       z.array(z.string()),
 *       confidence: z.enum(["high", "medium", "low"]),
 *       source_url: z.string().nullable(),
 *     })
 *
 *   Long-form content (article, report):
 *     z.object({
 *       title:      z.string(),
 *       content:    z.string(),   // full markdown article
 *       word_count: z.number(),   // AI estimates — use split(/\s+/).length for exact
 *       tags:       z.array(z.string()),
 *       summary:    z.string(),
 *     })
 */

/**
 * Output schema for visa guides.
 *
 * This matches the JSON structure requested in the prompt:
 * {
 *   "title": "Título do guia",
 *   "seoMetaDescription": "Descrição otimizada para SEO",
 *   "markdownText": "# Título\n\n## Subtítulo\n\nTexto do guia passo a passo em Markdown..."
 * }
 *
 * All fields are required and validated by zod.
 */

const faqItemSchema = z.object({
  question: z.string().min(1, "A pergunta não pode estar vazia"),
  answer: z.string().min(1, "A resposta não pode estar vazia"),
});

const imageHintsSchema = z.object({
  mainSubject: z.string().min(1, "Main subject obrigatório"),
  secondarySubject: z.string().min(1, "Secondary subject obrigatório"),
  visualStyle: z.string().min(1, "Visual style obrigatório"),
  searchQueries: z.array(z.string()).min(3, "Pelo menos 3 search queries"),
  suggestedAlt: z.string().min(1, "Alt sugerido obrigatório"),
});

export default z.object({
  title: z.string().min(1, "O título do artigo não pode estar vazio"),
  slug: z.string().min(1, "O slug não pode estar vazio"),
  seoMetaDescription: z.string().min(1, "A descrição SEO não pode estar vazia"),
  keywords: z.array(z.string()).min(1, "Deve haver pelo menos uma palavra-chave"),
  markdownText: z.string().min(1, "O conteúdo do artigo não pode estar vazio"),
  
  faq: z.array(faqItemSchema),
  
  imageHints: imageHintsSchema,
});
