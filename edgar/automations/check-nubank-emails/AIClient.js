import { z } from "zod";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractJson(text) {
  const trimmed = text.trim();

  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const withoutMarkdown = codeBlockMatch ? codeBlockMatch[1].trim() : trimmed;

  const objectMatch = withoutMarkdown.match(/\{[\s\S]*\}/);
  if (!objectMatch) {
    throw new Error("No JSON object found in response.");
  }

  return objectMatch[0];
}

async function withTimeout(promise, timeoutMs) {
  if (!timeoutMs) {
    return promise;
  }

  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("AI request timeout")), timeoutMs),
    ),
  ]);
}

export class AIClient {
  constructor({
    aiCallback,
    defaultTemperature = 0.3,
    maxRetries = 2,
    maxRepairAttempts = 1,
    timeoutMs = 30000,
    logger = console,
  }) {
    if (!aiCallback || typeof aiCallback !== "function") {
      throw new Error("aiCallback must be a function.");
    }

    this.aiCallback = aiCallback;
    this.defaultTemperature = defaultTemperature;
    this.maxRetries = maxRetries;
    this.maxRepairAttempts = maxRepairAttempts;
    this.timeoutMs = timeoutMs;
    this.logger = logger;
  }

  async generateText({ prompt, temperature }) {
    if (!prompt) {
      throw new Error("Prompt is required.");
    }

    return withTimeout(
      this.aiCallback({
        prompt,
        temperature: temperature ?? this.defaultTemperature,
      }),
      this.timeoutMs,
    );
  }

  async generateStructured({ prompt, schema, temperature }) {
    if (!prompt) {
      throw new Error("Prompt is required.");
    }
    if (!schema || !(schema instanceof z.ZodType)) {
      throw new Error("Valid Zod schema is required.");
    }

    let attempt = 0;

    while (attempt <= this.maxRetries) {
      try {
        this.logger.info?.(`Structured attempt ${attempt + 1}`);

        const response = await withTimeout(
          this.aiCallback({
            prompt,
            temperature: temperature ?? this.defaultTemperature,
          }),
          this.timeoutMs,
        );

        let parsed;

        // --------- STEP 1: SYNTAX VALIDATION ---------
        try {
          const jsonString = extractJson(response);
          parsed = JSON.parse(jsonString);
        } catch (syntaxError) {
          if (this.maxRepairAttempts <= 0) {
            throw syntaxError;
          }

          this.logger.warn?.("Syntax error detected. Attempting repair...");

          let repairAttempt = 0;
          let repairResponse = response;

          while (repairAttempt < this.maxRepairAttempts) {
            const repairPrompt = `
The following JSON is syntactically invalid.

Fix ONLY the JSON syntax.
Do NOT add explanations.
Return ONLY valid JSON.

${repairResponse}
`;

            repairResponse = await withTimeout(
              this.aiCallback({
                prompt: repairPrompt,
                temperature: 0,
              }),
              this.timeoutMs,
            );

            try {
              const repairedJson = extractJson(repairResponse);
              parsed = JSON.parse(repairedJson);
              break;
            } catch {
              repairAttempt++;
            }
          }

          if (!parsed) {
            throw new Error("JSON repair failed.", { cause: syntaxError });
          }
        }

        // --------- STEP 2: STRUCTURAL VALIDATION ---------
        const validation = schema.safeParse(parsed);

        if (validation.success) {
          return validation.data;
        }

        this.logger.warn?.("Schema validation failed. Attempting field repair...");

        const repairPrompt = `
The JSON below is syntactically valid but does not match the required schema.

Original user prompt:
${prompt}

Current JSON:
${JSON.stringify(parsed, null, 2)}

Validation errors:
${JSON.stringify(validation.error.errors, null, 2)}

Fix ONLY the invalid or missing fields.
Do NOT add explanations.
Return ONLY valid JSON.
`;

        const repairedResponse = await withTimeout(
          this.aiCallback({
            prompt: repairPrompt,
            temperature: 0,
          }),
          this.timeoutMs,
        );

        try {
          const repairedJson = extractJson(repairedResponse);
          const repairedParsed = JSON.parse(repairedJson);

          const finalValidation = schema.safeParse(repairedParsed);
          if (finalValidation.success) {
            return finalValidation.data;
          }
        } catch {
          this.logger.warn?.("Field repair parsing failed.");
        }

        if (attempt === this.maxRetries) {
          throw validation.error;
        }

        attempt++;
        await sleep(800 * attempt);
      } catch (error) {
        this.logger.warn?.(`Attempt ${attempt + 1} failed:`, error.message);

        if (attempt === this.maxRetries) {
          throw error;
        }

        attempt++;
        await sleep(800 * attempt);
      }
    }
  }
}
