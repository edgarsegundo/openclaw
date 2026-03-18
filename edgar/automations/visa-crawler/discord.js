import { logger } from "./logger.js";

const SEPARATOR = "━━━━━━━━━━━━━━━━━━━━━━━";

export async function notifyDiscord(message) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    logger.warn("DISCORD_WEBHOOK_URL not set, skipping notification");
    return;
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: `${SEPARATOR}\n${message}` }),
    });

    if (res.ok) {
      logger.debug("Discord notification sent.");
    } else {
      logger.error(`Discord notification failed: ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    const causa = err.cause ? ` — causa: ${String(err.cause)}` : "";
    logger.error(`Discord notification error: ${err.message}${causa}`);
  }
}
