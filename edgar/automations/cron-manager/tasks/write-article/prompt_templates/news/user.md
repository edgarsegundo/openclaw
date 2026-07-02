## Context

{{blog_context}}

## Assignment

Write an original article in **{{language}}** based on the factual subject of the reference below.

**Reference title:** {{title}}
**Reference link:** {{link}}

---

## Core fidelity (mandatory)

Before writing, identify the exact factual nucleus of the reference title:

- what happened
- what changed, was announced, decided, discovered, or debated
- who or what is affected
- what consequence matters to the audience

The article must preserve the same central subject and satisfy the same reader expectation created by the original title.

### Mandatory rules

- At least 70% of the article must remain centered on the same factual core
- The new title must keep the same subject, but use a different editorial construction
- Do not repeat the wording, syntax, or title logic of the reference title

### Forbidden

- turning a specific fact into generic explanatory content
- widening the topic beyond what the title requires
- shifting to adjacent subjects not necessary to explain the main fact

### Validation

- If the article could fit another title from the same category, rewrite it
- If a reader expecting the original title would not feel fully answered, rewrite it

---

## Originality (mandatory)

Use the reference link as primary orientation, but write as an independently researched article.

Add complementary value from other reliable sources, such as:

- newer details
- practical implications
- official clarifications
- directly relevant context

### Forbidden

- following the same paragraph order
- reproducing the same sequence of ideas
- rewriting paragraph by paragraph

The article must reflect independent reconstruction from facts, not source transformation.

---

## Audience adaptation

- Fully adapt explanations to the audience described in the context
- Use relevant consequences, examples, and framing for that audience

---

## Research instructions

1. Read the reference link as primary source

2. Search at least 2 additional reliable sources on the same factual subject

3. Extract:
   - who
   - what
   - when
   - where
   - why
   - practical consequence

4. Prioritize:
   - official sources
   - primary sources
   - recognized journalism sources

If sources conflict, prioritize official and newer information.

---

## Writing instructions

- Write entirely in **{{language}}**
- Create a completely new title
- Start with a strong opening that does not repeat title wording
- The first 2 paragraphs must explain the factual core directly
- Use journalistic tone: neutral, clear, informative
- Do not add opinions, speculation, exaggeration, or filler
- Avoid generic openings disconnected from the main fact
- Use a clearly different narrative structure from the reference source

### Structure

Use natural progression:

- factual opening
- explanation
- audience impact
- contextual complement only if necessary

Every paragraph must directly contribute to the main title topic.

---

### Structure (light requirement)

Use subheadings when they improve clarity and flow.

Rules:

- Include 2 to 3 subheadings (H2: ##) when the article length and complexity justify it
- For shorter news-style articles, use at least 2 subheadings whenever possible
- Subheadings must reflect key aspects of the factual core
- Keep them concise, specific, and journalistic
- Avoid generic labels like "Conclusion" or "Overview"

---

## Visual insertion

Insert 2 to 3 placeholders exactly as:

`<!--[[INSERIR IMAGEM: short objective description]]-->`

Rules:

- only between paragraphs
- never inside paragraphs
- descriptions must be objective and searchable

---

## Style

- Use **bold** sparingly
- Maximum 3 to 5 highlights
- Bold only short critical terms

---

## Anti-plagiarism check

Before finalizing:

- discard source paragraph order
- discard source explanation order
- avoid sentence resemblance
- ensure the article reads as independently written journalism

---

### Structure validation

If the article has more than 4 paragraphs, it should include at least 2 subheadings.

---

## Output format

Return ONLY a single valid JSON object — no prose, no explanation, no code fences before or after it.

### JSON string rules (mandatory)

The `markdownText` field contains a full article and is the most likely place to break the JSON. Follow these rules exactly:

- Escape every double quote inside any string value as `\"` (e.g. write `he said \"we will not close\"`, never a raw `"`).
- Escape every line break inside a string as `\n`. Do NOT put real, literal newlines inside the `markdownText` value — the entire article must be one JSON string using `\n` for paragraph breaks.
- Escape backslashes as `\\`.
- Do not add trailing commas.
- Prefer straight quotes rendered as `\"`; if you use curly quotes (`"` `"`) inside prose that is fine since they don't need escaping.

Return ONLY this JSON structure:

{
"title": "<new article title>",
"slug": "<url-friendly slug lowercase hyphenated>",
"language": "{{language}}",
"seoMetaDescription": "<120 to 160 characters>",
"markdownText": "<full markdown article, as a single JSON string with \\n for line breaks and \\\" for quotes>",
"imageHints": {
"searchQueries": [
"<query 1>",
"<query 2>",
"<query 3>"
],
"suggestedAlt": "<main image alt text>"
}
}
