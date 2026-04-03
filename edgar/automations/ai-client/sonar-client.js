/**
 * SonarClient — Perplexity Sonar API client with native JSON Schema support.
 *
 * Unlike AIClient (which parses text), Sonar uses response_format.json_schema
 * to return structured JSON directly from the API. This is ideal for web-search
 * use cases (sonar, sonar-pro) where you want grounded, up-to-date data.
 *
 * Usage:
 *   const client = new SonarClient({ apiKey: process.env.PERPLEXITY_API_KEY });
 *   const result = await client.generate({
 *     systemPrompt: "You are a visa expert...",
 *     userPrompt: "Check visa requirements for Brazilians in Japan.",
 *     schema: {
 *       type: "object",
 *       properties: { visaRequired: { type: "boolean" } },
 *       required: ["visaRequired"],
 *     },
 *     schemaName: "visa_check",  // optional
 *   });
 *   // result is the parsed object — already matches your schema
 */

import { BaseClient } from "./base-client.js";

export class SonarClient extends BaseClient {
  /**
   * @param {object} opts
   * @param {string} opts.apiKey         - PERPLEXITY_API_KEY
   * @param {string} [opts.model]        - default: "sonar"
   * @param {number} [opts.maxRetries]   - default: 2
   * @param {number} [opts.timeoutMs]    - default: 30000
   * @param {object} [opts.logger]       - compatible with console
   */
  constructor({ apiKey, model = "sonar", maxRetries = 2, timeoutMs = 30000, logger = console }) {
    super({ maxRetries, timeoutMs, logger });
    if (!apiKey) {
      throw new Error("SonarClient: apiKey is required.");
    }
    this.apiKey = apiKey;
    this.model = model;
  }

  /**
   * Call the Perplexity API with structured output (response_format.json_schema).
   *
   * @param {object} opts
   * @param {string} opts.userPrompt     - The user message
   * @param {string} [opts.systemPrompt] - Optional system message
   * @param {object} opts.schema         - JSON Schema object ({ type, properties, required })
   * @param {string} [opts.schemaName]   - Name for the json_schema (default: "response")
   * @param {number} [opts.temperature]  - Override temperature (default: 0.2 for factual tasks)
   * @param {import("zod").ZodType} [opts.zodSchema] - Optional Zod schema to validate result
   * @returns {Promise<object>}          - Parsed JSON object
   */
  async generate({
    userPrompt,
    systemPrompt,
    schema,
    schemaName = "response",
    temperature = 0.2,
    zodSchema,
  }) {
    if (!userPrompt) {
      throw new Error("SonarClient.generate: userPrompt is required.");
    }
    if (!schema) {
      throw new Error("SonarClient.generate: schema is required.");
    }

    const messages = this._buildMessages(systemPrompt, userPrompt);

    const body = {
      model: this.model,
      temperature,
      messages,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: schemaName,
          schema,
        },
      },
    };

    return this._withRetry(async () => {
      const result = await this._withTimeout(() => this._fetch(body));

      if (zodSchema) {
        const validation = zodSchema.safeParse(result);
        if (!validation.success) {
          throw new Error(
            `SonarClient: Zod validation failed: ${JSON.stringify(validation.error.errors)}`,
          );
        }
        return validation.data;
      }

      return result;
    }, `model: ${this.model}`);
  }

  async _fetch(body) {
    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(
        `SonarClient: API error ${response.status}: ${err.error?.message ?? JSON.stringify(err)}`,
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("SonarClient: API returned empty content.");
    }

    // Sonar with response_format should return clean JSON, but be defensive
    try {
      return JSON.parse(content);
    } catch {
      // Try extracting JSON object from response if there's surrounding text
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) {
        throw new Error(
          `SonarClient: Could not parse JSON from response: ${content.slice(0, 200)}`,
        );
      }
      return JSON.parse(match[0]);
    }
  }
}
