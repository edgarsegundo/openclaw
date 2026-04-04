import OpenAI from "openai";
import { z } from "zod";
import inquirer from "inquirer";
import {
  listTemplateNames,
  loadUserPrompt,
  loadSystemPrompt,
  loadZodSchema,
} from "./prompt-loader.js";
import { renderPrompt, mergeVars, warnUnresolvedVars } from "./prompt-render.js";
import logger from "./logger.js";

// ─── API helpers ──────────────────────────────────────────────────────────────

function buildClient(provider) {
  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {throw new Error("OPENAI_API_KEY is not set.");}
    return new OpenAI({ apiKey });
  }
  if (provider === "perplexity") {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {throw new Error("PERPLEXITY_API_KEY is not set.");}
    return new OpenAI({ apiKey, baseURL: "https://api.perplexity.ai" });
  }
  throw new Error(`Unknown provider: "${provider}". Supported: openai, perplexity.`);
}

/**
 * Perplexity's sonar accepts json_schema but only a minimal subset of JSON Schema keywords.
 * Zod's toJSONSchema() emits Draft 2020-12 extras ($schema, minLength, minItems, etc.)
 * that Perplexity rejects with a 400. Strip them down to what Perplexity actually accepts.
 * OpenAI (and future standards-compliant providers) receive the full schema unchanged.
 */
const PERPLEXITY_ALLOWED_SCHEMA_KEYS = new Set([
  "type", "properties", "required", "items",
  "anyOf", "oneOf", "allOf", "not",
  "enum", "const", "description", "title",
]);

function sanitizeSchemaForPerplexity(schema) {
  if (typeof schema !== "object" || schema === null) return schema;
  if (Array.isArray(schema)) return schema.map(sanitizeSchemaForPerplexity);
  const result = {};
  for (const [k, v] of Object.entries(schema)) {
    if (!PERPLEXITY_ALLOWED_SCHEMA_KEYS.has(k)) continue;
    result[k] = sanitizeSchemaForPerplexity(v);
  }
  return result;
}

/**
 * Build the response_format payload for a given provider.
 * - Perplexity: json_schema with sanitized schema (strips Zod Draft 2020-12 extras)
 * - OpenAI and others: json_schema with full schema
 */
function buildResponseFormat(provider, jsonSchema) {
  if (!jsonSchema) return null;
  const schema = provider === "perplexity"
    ? sanitizeSchemaForPerplexity(jsonSchema.schema)
    : jsonSchema.schema;
  return {
    type: "json_schema",
    json_schema: { name: jsonSchema.name, schema },
  };
}

/**
 * Call the AI API with optional native json_schema enforcement.
 * When jsonSchema is provided the API guarantees structurally valid JSON — no text-parsing needed.
 * Retries with linear backoff on failure.
 */
async function callApi({ provider, model, messages, jsonSchema, temperature, maxTokens, maxRetries, timeoutMs }) {
  const client = buildClient(provider);
  const params = { model, temperature, messages };
  // Only pass max_tokens if explicitly set — omitting lets the model use its full default limit.
  if (maxTokens != null) {params.max_tokens = maxTokens;}
  const responseFormat = buildResponseFormat(provider, jsonSchema);
  if (responseFormat) {params.response_format = responseFormat;}

  let lastErr;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await client.chat.completions.create(params, { signal: controller.signal });
        return {
          content: res.choices[0].message.content,
          // Perplexity-only fields — undefined/empty for OpenAI
          citations: res.citations ?? [],
          searchResults: res.search_results ?? [],
          usage: res.usage ?? null,
        };
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      lastErr = err;
      if (attempt <= maxRetries) {
        const wait = 1000 * attempt;
        logger.warn(`[prompt-runner] Attempt ${attempt} failed: ${err.message}. Retrying in ${wait}ms…`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw lastErr;
}

/**
 * Select a template for a task run.
 *
 * - If templateOption is given → validate and return it directly.
 * - In cron mode without templateOption → throw (template required for cron).
 * - In manual mode without templateOption → ask the user interactively.
 * - Returns null if the user skips or no templates exist.
 */
export async function selectTemplate(taskDir, templateOption, mode) {
  const templateNames = listTemplateNames(taskDir);

  if (templateNames.length === 0) {
    if (templateOption) {
      throw new Error(
        `No prompt_templates/ folder found in this task, but --template "${templateOption}" was specified.`
      );
    }
    return null;
  }

  if (templateOption) {
    if (!templateNames.includes(templateOption)) {
      throw new Error(
        `Template "${templateOption}" not found. Available: ${templateNames.join(", ")}`
      );
    }
    return templateOption;
  }

  // No --template flag provided
  if (mode === "cron") {
    throw new Error(
      `Task has prompt templates but --template was not specified. ` +
        `In cron mode, --template is required. Available: ${templateNames.join(", ")}`
    );
  }

  // Manual mode: ask the user
  const SKIP = "__skip__";
  const choices = [
    { name: "Skip (no template)", value: SKIP },
    ...templateNames.map((name) => ({ name, value: name })),
  ];

  const { selected } = await inquirer.prompt([
    {
      type: "list",
      name: "selected",
      message: "Select a prompt template to use (or skip):",
      choices,
    },
  ]);

  return selected === SKIP ? null : selected;
}

/**
 * Collect / resolve inputs declared in a template config.
 * - In cron mode: all required inputs must have a default; no prompts.
 * - In manual mode: ask the user interactively.
 * Returns a plain object of resolved values.
 */
export async function prepareTemplateInputs(templateConfig, mode) {
  const inputs = templateConfig.inputs || [];
  const result = {};

  if (mode === "cron") {
    const missing = [];
    for (const input of inputs) {
      if (input.default !== undefined && input.default !== null) {
        result[input.name] = input.default;
      } else if (input.required) {
        missing.push(input.name);
      }
    }
    if (missing.length > 0) {
      throw new Error(
        `Template inputs missing defaults in cron mode: ${missing.join(", ")}`
      );
    }
    return result;
  }

  // Manual mode — no inputs declared
  if (inputs.length === 0) {return result;}

  const questions = inputs.map((input) => {
    const base = {
      name: input.name,
      message: input.help_tip || input.name,
      default: input.default != null ? String(input.default) : undefined,
    };
    if (input.type === "boolean") {
      return { ...base, type: "confirm", default: Boolean(input.default ?? false) };
    }
    return {
      ...base,
      type: "input",
      validate(val) {
        if (!val && input.required) {return "This field is required";}
        if (input.type === "number" && val && isNaN(Number(val))) {return "Must be a number";}
        return true;
      },
    };
  });

  const answers = await inquirer.prompt(questions);
  for (const input of inputs) {
    const val = answers[input.name];
    result[input.name] = input.type === "number" && val != null ? Number(val) : val;
  }

  return result;
}

/**
 * Build the `runPrompt(extraVars?)` async function that will be injected into context.
 *
 * Variables are merged with this priority (highest last wins):
 *   taskInputs → templateInputDefaults → contextFields → preparedTemplateInputs → extraVars
 *
 * Returns:
 *   { artifact, citations, searchResults, usage, template, model }
 *
 *   artifact      — object validated against schema.js (the AI-generated payload)
 *   citations     — string[] of source URLs (Perplexity/sonar only; [] for OpenAI)
 *   searchResults — SearchResult[] rich metadata aligned 1:1 with citations (Perplexity only)
 *   usage         — token counts + cost breakdown; Perplexity includes usage.cost.total_cost (USD)
 *   template      — template name used for this call
 *   model         — model string from template config
 */
export async function buildRunPromptFn(
  taskDir,
  templateName,
  templateConfig,
  taskInputs,
  preparedTemplateInputs,
  contextFields
) {
  const zodSchema = await loadZodSchema(taskDir, templateName);
  // json_schema_enforcement defaults to true. Set to false in template config when the model
  // is expected to generate long content (e.g. markdownText with 1000+ words) — in that case
  // json_schema enforcement suppresses content generation in favour of minimal valid JSON.
  // The prompt itself must instruct the model to return JSON; Zod validates after parsing.
  const enforceJsonSchema = templateConfig.options?.json_schema_enforcement !== false;
  const jsonSchema = (zodSchema && enforceJsonSchema)
    ? { name: templateName.replace(/[^a-zA-Z0-9_]/g, "_"), schema: z.toJSONSchema(zodSchema) }
    : null;

  const userPromptText = loadUserPrompt(
    taskDir,
    templateName,
    templateConfig.user_prompt_file
  );
  const systemPromptRaw = loadSystemPrompt(
    taskDir,
    templateName,
    templateConfig.system_prompt_file
  );

  // Collect declared default values from template inputs
  const templateInputDefaults = {};
  for (const input of templateConfig.inputs || []) {
    if (input.default != null) {templateInputDefaults[input.name] = input.default;}
  }

  return async function runPrompt(extraVars = {}) {
    // Merge all variable sources
    const vars = mergeVars(
      { ...taskInputs, ...templateInputDefaults, ...contextFields, ...preparedTemplateInputs },
      {},
      {},
      extraVars
    );

    const renderedPrompt = renderPrompt(userPromptText, vars);
    warnUnresolvedVars(renderedPrompt, templateName, logger);

    const renderedSystem = systemPromptRaw ? renderPrompt(systemPromptRaw, vars) : null;

    const messages = [];
    if (renderedSystem) {messages.push({ role: "system", content: renderedSystem });}
    messages.push({ role: "user", content: renderedPrompt });

    const { content: rawText, citations, searchResults, usage } = await callApi({
      provider: templateConfig.provider,
      model: templateConfig.model,
      messages,
      jsonSchema,
      temperature: templateConfig.options?.temperature ?? 0.3,
      maxTokens: templateConfig.options?.max_tokens ?? null,
      maxRetries: templateConfig.options?.max_retries ?? 2,
      timeoutMs: templateConfig.options?.timeout_ms ?? 30000,
    });

    logger.info(`[prompt-runner] Raw response length: ${rawText.length} chars`);
    logger.info(`[prompt-runner] Raw response preview: ${rawText.slice(0, 300)}…`);

    let artifact;
    if (zodSchema) {
      let parsed;
      try {
        parsed = JSON.parse(rawText);
      } catch (err) {
        // Log full raw text to help diagnose truncation
        logger.warn(`[prompt-runner] JSON parse failed. Full raw response:\n${rawText}`);
        throw new Error(`runPrompt: Failed to parse AI response as JSON: ${err.message}`, { cause: err });
      }
      artifact = zodSchema.parse(parsed);
    } else {
      // No schema — best-effort JSON extraction from free-text response.
      const match = rawText.match(/\{[\s\S]*\}/);
      if (!match) {
        throw new Error(
          `runPrompt: AI response contained no JSON object. Raw response:\n${rawText.slice(0, 500)}`
        );
      }
      try {
        artifact = JSON.parse(match[0]);
      } catch (err) {
        throw new Error(`runPrompt: Failed to parse AI response as JSON: ${err.message}`, { cause: err });
      }
    }

    return {
      artifact,
      // Perplexity (sonar models) only — empty arrays / null for OpenAI
      citations,      // string[] — URLs das fontes consultadas; [1] no texto → citations[0]
      searchResults,  // SearchResult[] — { title, url, snippet, date } alinhado 1:1 com citations
      usage,          // { prompt_tokens, completion_tokens, ... } + cost (Perplexity: usage.cost.total_cost)
      template: templateName,
      model: templateConfig.model,
    };
  };
}

/**
 * Build a dry-run preview of the prompt (no API call).
 * Replaces unresolved {{vars}} with "[var_name]" placeholders for display.
 */
export function buildDryRunPromptPreview(taskDir, templateName, templateConfig) {
  try {
    const userPromptText = loadUserPrompt(
      taskDir,
      templateName,
      templateConfig.user_prompt_file
    );
    // Replace all {{var}} with [var] for readable preview
    const preview = userPromptText.replace(/\{\{(\s*[\w.]+\s*)\}\}/g, (_, k) => `[${k.trim()}]`);
    return preview;
  } catch {
    return "(could not load prompt file)";
  }
}
