import { z } from "zod";

/**
 * Output schema for the analyze-word template.
 *
 * This is the single source of truth for the AI response structure.
 * It serves two purposes:
 *   1. Sent to the API as `response_format: json_schema` — the API guarantees
 *      the response matches this shape before returning it.
 *   2. Zod validates the parsed result as a final safety net.
 *
 * Rules:
 *   - Root must always be z.object({}) — the OpenAI API requires an object at the top level.
 *   - Each field here should have a clear counterpart in user.md so the AI knows what to fill in.
 *   - Use .nullable() for fields that may not apply (e.g. antonyms for a proper noun).
 *   - For free-text output (articles, reports), wrap the content in a single field:
 *       content: z.string()   ← markdown string goes here
 *     and add metadata fields alongside it (title, tags, word_count, etc.).
 */
export default z.object({
  word: z.string(),
  part_of_speech: z.string(),
  definition: z.string(),
  synonyms: z.array(z.string()),
  antonyms: z.array(z.string()),
  example_sentence: z.string(),
});
