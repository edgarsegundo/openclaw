import logger from "./logger.js";

const SEPARATOR = "━━━━━━━━━━━━━━━━━━━━━━━";

let queue = Promise.resolve();

export function notifyDiscord(message, webhookUrl) {
  queue = queue
    .then(() => send(message, webhookUrl))
    .catch(err => {
      logger.error("Queue error:", err);
      throw err; // mantém propagação para quem usa await
    });

  return queue;
}

async function send(message, webhookUrl, retries = 3) {
  if (!webhookUrl) {
    logger.warn("DISCORD_WEBHOOK_URL not set, skipping notification");
    return;
  }

  let timeout;

  try {
    // ⏱️ throttle preventivo com jitter
    const delay = 300 + Math.random() * 200;
    await new Promise(r => setTimeout(r, delay));

    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: `${SEPARATOR}\n${message}`
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    // 🔴 Rate limit (fallback robusto)
    if (res.status === 429) {
      const data = await res.json();

      const raw = data.retry_after || 1000;
      const wait = raw < 50 ? raw * 1000 : raw; // suporta segundos ou ms

      logger.warn(`Rate limited. Waiting ${wait}ms...`);
      await new Promise(r => setTimeout(r, wait));

      if (retries > 0) {
        return send(message, webhookUrl, retries - 1);
      }

      throw new Error("Rate limit retries exhausted");
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    logger.info("Discord notification sent.");

  } catch (err) {
    if (timeout) clearTimeout(timeout);

    logger.error(`Discord notification error: ${err.message}`);

    if (retries > 0) {
      // 🔁 backoff progressivo com jitter
      const backoff = (1000 * (4 - retries)) + Math.random() * 300;
      await new Promise(r => setTimeout(r, backoff));
      return send(message, webhookUrl, retries - 1);
    }

    // ❗ falha explícita
    throw new Error("Failed to send Discord notification after retries");
  }
}
