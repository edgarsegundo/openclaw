## Blog context

{{blog_context}}

## Your task

Below is a list of {{total_items}} news items collected from RSS feeds on the topic "{{topic}}".

For each item, assign a relevance score from 0 to 10 based on:
- How directly relevant it is to the blog's audience (most important)
- Whether it brings genuinely new or useful information
- Whether it is a duplicate of another item in the list (if so, score the duplicate as 0)
- Whether it is noise (keyword matched by accident, unrelated content — score as 0)

Approve all items with score >= {{min_score}}.

## News items ({{total_items}} items)

{{items_json}}

Respond ONLY with this exact JSON structure, no explanation, no markdown, no preamble:
{
  "topic": "<topic name>",
  "evaluated_at": "<current ISO datetime>",
  "results": [
    {
      "title": "<original title>",
      "link": "<original link>",
      "published": "<original published date or null>",
      "score": <0-10>
    }
  ]
}
