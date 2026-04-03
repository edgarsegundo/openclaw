/**
 * OpenAIClient — OpenAI chat completions client with structured output support.
 *
 * Two modes:
 *   - generateText({ systemPrompt, userPrompt })
 *       Returns the raw string response.
 *
 *   - generateStructured({ systemPrompt, userPrompt, zodSchema })
 *       Uses response_format: { type: "json_object" } and validates the result
 *       against a Zod schema, with auto-repair on failure.
 *
 * Usage:
 *   const client = new OpenAIClient({ apiKey: process.env.OPENAI_API_KEY });
 *
 *   const text = await client.generateText({
 *     systemPrompt: "You are a helpful assistant.",
 *     userPrompt: "Explain black holes in one sentence.",
 *   });
 *
 *   const data = await client.generateStructured({
 *     systemPrompt: "You are a data extractor. Return only JSON.",
 *     userPrompt: "Extract name and age from: Alice is 30 years old.",
 *     zodSchema: z.object({ name: z.string(), age: z.number() }),
 *   });
 */

import OpenAI from "openai";
import { z } from "zod";
import { BaseClient, extractJson } from "./base-client.js";

export class OpenAIClient extends BaseClient {
  /**
   * @param {object} opts
   * @param {string} opts.apiKey              - OPENAI_API_KEY
   * @param {string} [opts.model]             - default: "gpt-4o-mini"
   * @param {number} [opts.defaultTemperature]- default: 0.3
   * @param {number} [opts.maxRetries]        - default: 2
   * @param {number} [opts.timeoutMs]         - default: 30000
   * @param {object} [opts.logger]            - compatible with console
   */
  constructor({
    apiKey,
    model = "gpt-4o-mini",
    defaultTemperature = 0.3,
    maxRetries = 2,
    timeoutMs = 30000,
    logger = console,
  }) {
    super({ maxRetries, timeoutMs, logger });
    if (!apiKey) {
      throw new Error("OpenAIClient: apiKey is required.");
    }
    this.openai = new OpenAI({ apiKey });
    this.model = model;
    this.defaultTemperature = defaultTemperature;
  }

  /**
   * Generate a plain text response.
   *
   * @param {object} opts
   * @param {string} opts.userPrompt
   * @param {string} [opts.systemPrompt]
   * @param {number} [opts.temperature]
   * @returns {Promise<string>}
   */
  async generateText({ userPrompt, systemPrompt, temperature }) {
    if (!userPrompt) {
      throw new Error("OpenAIClient.generateText: userPrompt is required.");
    }
    const messages = this._buildMessages(systemPrompt, userPrompt);
    return this._withTimeout(() =>
      this._chat({ messages, temperature: temperature ?? this.defaultTemperature }),
    );
  }

  /**
   * Generate a structured JSON response, validated against a Zod schema.
   * Uses response_format: json_object and applies auto-repair on parse/validation failure.
   *
   * @param {object} opts
   * @param {string} opts.userPrompt
   * @param {string} [opts.systemPrompt]
   * @param {import("zod").ZodType} opts.zodSchema
   * @param {number} [opts.temperature]
   * @returns {Promise<object>}
   */
  async generateStructured({ userPrompt, systemPrompt, zodSchema, temperature }) {
    if (!userPrompt) {
      throw new Error("OpenAIClient.generateStructured: userPrompt is required.");
    }
    if (!zodSchema || !(zodSchema instanceof z.ZodType)) {
      throw new Error("OpenAIClient.generateStructured: valid Zod schema is required.");
    }

    const messages = this._buildMessages(systemPrompt, userPrompt);

    return this._withRetry(async () => {
      const text = await this._withTimeout(() =>
        this._chat({
          messages,
          temperature: temperature ?? this.defaultTemperature,
          responseFormat: { type: "json_object" },
        }),
      );

      let parsed;
      try {
        parsed = JSON.parse(extractJson(text));
      } catch (syntaxErr) {
        this.logger.warn?.("[OpenAIClient] JSON parse failed, requesting repair...");
        parsed = await this._repairJson(text, syntaxErr);
      }

      const validation = zodSchema.safeParse(parsed);
      if (validation.success) {
        return validation.data;
      }

      this.logger.warn?.("[OpenAIClient] Schema validation failed, requesting field repair...");
      parsed = await this._repairFields(userPrompt, parsed, validation.error);

      const finalValidation = zodSchema.safeParse(parsed);
      if (finalValidation.success) {
        return finalValidation.data;
      }

      throw finalValidation.error;
    }, `model: ${this.model}`);
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  async _chat({ messages, temperature, responseFormat }) {
    const params = { model: this.model, temperature, messages };
    if (responseFormat) {
      params.response_format = responseFormat;
    }
    const res = await this.openai.chat.completions.create(params);
    return res.choices[0].message.content;
  }

  async _repairJson(brokenText, cause) {
    const repairPrompt = `The following text contains invalid JSON. Fix ONLY the syntax. Return ONLY valid JSON, no explanations.\n\n${brokenText}`;
    const fixed = await this._withTimeout(() =>
      this._chat({
        messages: [{ role: "user", content: repairPrompt }],
        temperature: 0,
        responseFormat: { type: "json_object" },
      }),
    );
    try {
      return JSON.parse(extractJson(fixed));
    } catch {
      throw new Error(`OpenAIClient: JSON repair failed. Original cause: ${cause.message}`);
    }
  }

  async _repairFields(originalPrompt, parsed, zodError) {
    const repairPrompt = `The JSON below is valid but does not match the required schema.

Original prompt:
${originalPrompt}

Current JSON:
${JSON.stringify(parsed, null, 2)}

Validation errors:
${JSON.stringify(zodError.errors, null, 2)}

Fix ONLY the invalid or missing fields. Return ONLY valid JSON, no explanations.`;
    const fixed = await this._withTimeout(() =>
      this._chat({
        messages: [{ role: "user", content: repairPrompt }],
        temperature: 0,
        responseFormat: { type: "json_object" },
      }),
    );
    try {
      return JSON.parse(extractJson(fixed));
    } catch {
      return parsed; // return original if repair parse fails — outer loop will retry
    }
  }
}
