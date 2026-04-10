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
export default z.object({
  // TODO: define your output fields here
  // result: z.string(),
});
