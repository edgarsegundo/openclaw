# Automated Article Image Pipeline for Astro Blog

## Objective

Build an automated pipeline that:

1. Generates article content
2. Extracts visual intent from article text
3. Searches licensed image providers
4. Scores candidate images semantically
5. Selects best image
6. Stores only metadata or optional local cache
7. Injects image into Astro frontmatter automatically

---

# High-Level Architecture

```txt
Article Generator
↓
Visual Keyword Extractor
↓
Image Search Layer
↓
Semantic Ranking Layer
↓
License Validation Layer
↓
Image Selection
↓
Astro Frontmatter Injection
↓
Optional Local Cache
```

---

# Core Design Principles

## Prioritize zero manual intervention

Pipeline must run fully automatically.

## Minimize legal risk

Only use providers with explicit API license terms.

## Avoid local storage when possible

Prefer provider CDN URLs.

## Support fallback generation

If no suitable licensed image is found, trigger generative image model.

---

# Recommended Providers

## Tier 1 Providers

* Unsplash API
* Pexels API
* Pixabay API

## Why

These providers:

* provide stable CDN URLs
* have clear license policies
* support attribution metadata
* allow automation safely

---

# Recommended Selection Strategy

## Step 1 — Extract Visual Intent

Input:

article markdown

Output:

```json
{
  "main_subject": "AI coding assistant",
  "secondary_subject": "developer laptop",
  "style": "modern technology"
}
```

---

## Prompt Strategy for LLM

Prompt:

```txt
Extract 3 visual search queries for this article:

- one main concrete subject
- one supporting visual subject
- one visual style descriptor

Return JSON only.
```

---

# Step 2 — Multi-provider Search

## Query Providers Sequentially

Order:

1. Unsplash
2. Pexels
3. Pixabay

## Search Example

```ts
searchImages("AI coding assistant modern technology")
```

## Return Top 5 from each provider

Normalize output:

```ts
type CandidateImage = {
  provider: string
  imageUrl: string
  author: string
  sourceUrl: string
  width: number
  height: number
  license: string
}
```

---

# Step 3 — Hard Filters

Reject images if:

* portrait orientation
* width < 1200px
* suspicious watermark
* poor aspect ratio

## Recommended Ratio

```txt
16:9
or
1.91:1
```

---

# Step 4 — Semantic Ranking

Use LLM to score candidates.

## Prompt

```txt
Given article title:

"Future of AI Coding Agents"

Choose best image from candidates.

Criteria:
- semantic relevance
- visual clarity
- editorial quality

Return winner only.
```

## Candidate Input

Provide only:

* preview URL
* alt description if available

---

# Step 5 — License Validation

## Mandatory Rule

Only accept:

```txt
license in:
- unsplash
- pexels
- pixabay
```

Reject everything else.

---

# Step 6 — Image Selection Output

Return:

```json
{
  "provider": "unsplash",
  "imageUrl": "...",
  "author": "...",
  "sourceUrl": "...",
  "license": "unsplash"
}
```

---

# Step 7 — Astro Frontmatter Injection

Inject into markdown:

```yaml
image:
  provider: unsplash
  url: https://images.unsplash.com/...
  author: John Doe
  source: https://unsplash.com/photos/abc
```

---

# Astro Rendering Component

## Component

```astro
---
const image = Astro.props.image;
---

<img
  src={image.url}
  alt={Astro.props.title}
  loading="lazy"
  decoding="async"
/>
```

---

# Optional Attribution Footer

Recommended:

```astro
<p>
Photo by {image.author}
</p>
```

Optional link to source.

---

# Step 8 — Fallback Strategy

If no image passes score threshold:

Trigger generative image model.

---

# Fallback Rule

## Threshold

```txt
semantic_score < 0.75
```

→ generate image

---

# Generative Prompt Strategy

Prompt:

```txt
Editorial style blog cover image:
AI coding assistant, laptop, modern clean background
```

---

# Step 9 — Optional Local Cache

Only cache if article becomes high traffic.

## Cache Rule

If:

```txt
views > threshold
```

Then:

download image locally

Store:

```txt
/public/images/post-slug.webp
```

---

# Step 10 — Optional CDN Rewrite

For provider URLs:

Normalize width:

## Unsplash Example

Append:

```txt
?w=1600&q=80&fit=max
```

---

# Production Node Modules

Recommended:

```txt
axios
sharp
zod
openai or anthropic sdk
gray-matter
```

---

# Suggested Folder Structure

```txt
/scripts/image-pipeline/
  extractKeywords.ts
  searchProviders.ts
  rankImages.ts
  validateLicense.ts
  injectFrontmatter.ts
```

---

# Failure Handling

## If provider fails

Fallback next provider.

## If all providers fail

Fallback generative image.

## If generation fails

Use default category image.

---

# Logging

Store:

```json
{
  "article": "...",
  "selected_provider": "...",
  "fallback_used": false
}
```

---

# Future Improvement

## Add image deduplication

Prevent repeating same visual style across articles.

## Add brand consistency score

Prefer similar image mood across site.

## Add visual entropy score

Reject overused stock-photo style.

---

# Final Goal

Fully autonomous article publishing:

```txt
generate article
+
find legal image
+
rank quality
+
publish Astro-ready markdown
```
