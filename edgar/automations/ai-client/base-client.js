/**
 * BaseClient — shared plumbing for OpenAIClient and SonarClient.
 * Not meant to be used directly.
 */

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function extractJson(text) {
  const trimmed = text.trim();
  const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const raw = codeBlock ? codeBlock[1].trim() : trimmed;
  const obj = raw.match(/\{[\s\S]*\}/);
  if (!obj) {
    throw new Error("No JSON object found in response.");
  }
  return obj[0];
}

export class BaseClient {
  constructor({ maxRetries = 2, timeoutMs = 30000, logger = console } = {}) {
    this.maxRetries = maxRetries;
    this.timeoutMs = timeoutMs;
    this.logger = logger;
  }

  _buildMessages(systemPrompt, userPrompt) {
    const messages = [];
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: userPrompt });
    return messages;
  }

  _withTimeout(fn) {
    return Promise.race([
      fn(),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`${this.constructor.name}: request timeout`)),
          this.timeoutMs,
        ),
      ),
    ]);
  }

  async _withRetry(fn, label) {
    let attempt = 0;
    let lastError;
    while (attempt <= this.maxRetries) {
      try {
        this.logger.info?.(
          `[${this.constructor.name}] Attempt ${attempt + 1}${label ? ` — ${label}` : ""}`,
        );
        return await fn();
      } catch (err) {
        lastError = err;
        this.logger.warn?.(
          `[${this.constructor.name}] Attempt ${attempt + 1} failed: ${err.message}`,
        );
        if (attempt < this.maxRetries) {
          await sleep(800 * (attempt + 1));
        }
        attempt++;
      }
    }
    throw lastError;
  }
}
