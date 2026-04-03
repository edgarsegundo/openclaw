import inquirer from "inquirer";
import OpenAI from "openai";
import { z } from "zod";
import logger from "./logger.js";
import {
  listTemplateNames,
  loadUserPrompt,
  loadSystemPrompt,
  loadZodSchema,
} from "./prompt-loader.js";
import { renderPrompt, mergeVars, warnUnresolvedVars } from "./prompt-render.js";

// ─── API helpers ──────────────────────────────────────────────────────────────

function buildClient(provider) {
  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set.");
    }
    return new OpenAI({ apiKey });
  }
  if (provider === "perplexity") {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
      throw new Error("PERPLEXITY_API_KEY is not set.");
    }
    return new OpenAI({ apiKey, baseURL: "https://api.perplexity.ai" });
  }
  throw new Error(`Unknown provider: "${provider}". Supported: openai, perplexity.`);
}

/**
 * Call the AI API with optional native json_schema enforcement.
 * When jsonSchema is provided the API guarantees structurally valid JSON — no text-parsing needed.
 * Retries with linear backoff on failure.
 */
async function callApi({
  provider,
  model,
  messages,
  jsonSchema,
  temperature,
  maxTokens,
  maxRetries,
  timeoutMs,
}) {
  const client = buildClient(provider);
  const params = { model, temperature, messages };
  // Only pass max_tokens if explicitly set — omitting lets the model use its full default limit.
  if (maxTokens != null) {
    params.max_tokens = maxTokens;
  }
  if (jsonSchema) {
    params.response_format = {
      type: "json_schema",
      json_schema: { name: jsonSchema.name, schema: jsonSchema.schema },
    };
  }

  let lastErr;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await client.chat.completions.create(params, { signal: controller.signal });
        return res.choices[0].message.content;
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      lastErr = err;
      if (attempt <= maxRetries) {
        const wait = 1000 * attempt;
        logger.warn(
          `[prompt-runner] Attempt ${attempt} failed: ${err.message}. Retrying in ${wait}ms…`,
        );
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
        `No prompt_templates/ folder found in this task, but --template "${templateOption}" was specified.`,
      );
    }
    return null;
  }

  if (templateOption) {
    if (!templateNames.includes(templateOption)) {
      throw new Error(
        `Template "${templateOption}" not found. Available: ${templateNames.join(", ")}`,
      );
    }
    return templateOption;
  }

  // No --template flag provided
  if (mode === "cron") {
    throw new Error(
      `Task has prompt templates but --template was not specified. ` +
        `In cron mode, --template is required. Available: ${templateNames.join(", ")}`,
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
      throw new Error(`Template inputs missing defaults in cron mode: ${missing.join(", ")}`);
    }
    return result;
  }

  // Manual mode — no inputs declared
  if (inputs.length === 0) {
    return result;
  }

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
        if (!val && input.required) {
          return "This field is required";
        }
        if (input.type === "number" && val && isNaN(Number(val))) {
          return "Must be a number";
        }
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
 *   { artifact, template, model, usage: null }
 */
export async function buildRunPromptFn(
  taskDir,
  templateName,
  templateConfig,
  taskInputs,
  preparedTemplateInputs,
  contextFields,
) {
  const zodSchema = await loadZodSchema(taskDir, templateName);
  // Convert Zod schema → JSON Schema for native API enforcement.
  // schema.js is the single source of truth — no schema_description in the prompt needed.
  const jsonSchema = zodSchema
    ? { name: templateName.replace(/[^a-zA-Z0-9_]/g, "_"), schema: z.toJSONSchema(zodSchema) }
    : null;

  const userPromptText = loadUserPrompt(taskDir, templateName, templateConfig.user_prompt_file);
  const systemPromptRaw = loadSystemPrompt(
    taskDir,
    templateName,
    templateConfig.system_prompt_file,
  );

  // Collect declared default values from template inputs
  const templateInputDefaults = {};
  for (const input of templateConfig.inputs || []) {
    if (input.default != null) {
      templateInputDefaults[input.name] = input.default;
    }
  }

  return async function runPrompt(extraVars = {}) {
    // Merge all variable sources
    const vars = mergeVars(
      { ...taskInputs, ...templateInputDefaults, ...contextFields, ...preparedTemplateInputs },
      {},
      {},
      extraVars,
    );

    const renderedPrompt = renderPrompt(userPromptText, vars);
    warnUnresolvedVars(renderedPrompt, templateName, logger);

    const renderedSystem = systemPromptRaw ? renderPrompt(systemPromptRaw, vars) : null;

    const messages = [];
    if (renderedSystem) {
      messages.push({ role: "system", content: renderedSystem });
    }
    messages.push({ role: "user", content: renderedPrompt });

    const rawText = await callApi({
      provider: templateConfig.provider,
      model: templateConfig.model,
      messages,
      jsonSchema,
      temperature: templateConfig.options?.temperature ?? 0.3,
      maxTokens: templateConfig.options?.max_tokens ?? null,
      maxRetries: templateConfig.options?.max_retries ?? 2,
      timeoutMs: templateConfig.options?.timeout_ms ?? 30000,
    });

    let artifact;
    if (zodSchema) {
      // API already enforced the structure; Zod parse is a final safety net.
      artifact = zodSchema.parse(JSON.parse(rawText));
    } else {
      // No schema — best-effort JSON extraction from free-text response.
      const match = rawText.match(/\{[\s\S]*\}/);
      if (!match) {
        throw new Error(
          `runPrompt: AI response contained no JSON object. Raw response:\n${rawText.slice(0, 500)}`,
        );
      }
      try {
        artifact = JSON.parse(match[0]);
      } catch (err) {
        throw new Error(`runPrompt: Failed to parse AI response as JSON: ${err.message}`, {
          cause: err,
        });
      }
    }

    return {
      artifact,
      template: templateName,
      model: templateConfig.model,
      usage: null,
    };
  };
}

/**
 * Build a dry-run preview of the prompt (no API call).
 * Replaces unresolved {{vars}} with "[var_name]" placeholders for display.
 */
export function buildDryRunPromptPreview(taskDir, templateName, templateConfig) {
  try {
    const userPromptText = loadUserPrompt(taskDir, templateName, templateConfig.user_prompt_file);
    // Replace all {{var}} with [var] for readable preview
    const preview = userPromptText.replace(/\{\{(\s*[\w.]+\s*)\}\}/g, (_, k) => `[${k.trim()}]`);
    return preview;
  } catch {
    return "(could not load prompt file)";
  }
}
