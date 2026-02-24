import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import { config } from "dotenv";
import { convert } from "html-to-text";
import { ImapFlow } from "imapflow";
import "winston-daily-rotate-file";
import OpenAI from "openai";
import winston from "winston";
import { z } from "zod";
import { AIClient } from "../ai-client/ai-client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, ".env") });

// ─── Constants ───────────────────────────────────────────────────────────────

const DB_PATH = path.join(__dirname, "db.fastvistos");
const LOG_PATH = path.join(__dirname, "app.log");
const LOG_MAX_SIZE = "10m";
const BODY_MAX_LENGTH = 10_000;

const IMAP_CONFIG = {
  host: "imap.gmail.com",
  port: 993,
  secure: true,
  auth: {
    user: process.env.MAIL_USER || "",
    pass: process.env.MAIL_APP_PASSWORD || "",
  },
  logger: false,
};

const SEARCH_CONFIG = {
  email: "todomundo@nubank.com.br",
  subjectContains: "transfer", // filtro local flexível, sem acento
  subjectExpected: "transferência pelo pix", // referência para detectar variações
};

const DEBUG_SINCE_DATE = new Date("2025-12-26T00:00:00.000-03:00"); // TODO: remove before production
const USE_DEBUG_SINCE_DATE = false; // TODO: set to false before production

const CUTOFF_LOOKBACK_DAYS = 2; // subtrai X dias do cutoff para evitar gaps

const RETRY_CONFIG = {
  attempts: 3,
  delays: [30_000, 60_000, 120_000],
};

// ─── Logger ──────────────────────────────────────────────────────────────────

const logger = winston.createLogger({
  level: "debug",
  format: winston.format.combine(
    winston.format.timestamp({ format: "DD/MM/YYYY HH:mm:ss" }),
    winston.format.printf(({ timestamp, level, message }) => {
      return `[${String(timestamp)}] [${level.toUpperCase()}] ${String(message)}`;
    }),
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: LOG_PATH,
      maxsize: LOG_MAX_SIZE,
      maxFiles: 5,
      tailable: true,
    }),
  ],
});

// ─── OpenAI + AIClient setup ─────────────────────────────────────────────────

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const aiClient = new AIClient({
  aiCallback: async ({ prompt, temperature }) => {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature,
      messages: [{ role: "user", content: prompt }],
    });
    return response.choices[0].message.content ?? "";
  },
  defaultTemperature: 0.1,
  maxRetries: 2,
  maxRepairAttempts: 1,
  timeoutMs: 30_000,
  logger,
});

// ─── Discord Notification ─────────────────────────────────────────────────────

async function notifyDiscord(message) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    logger.warn("DISCORD_WEBHOOK_URL not set, skipping notification");
    return;
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message }),
    });

    if (!res.ok) {
      logger.error(`Discord notification failed: ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    logger.error(`Discord notification error: ${err.message}`);
  }
}

// ─── Database ────────────────────────────────────────────────────────────────

function openDatabase() {
  logger.debug(`Opening database at: ${DB_PATH}`);
  const db = new Database(DB_PATH);

  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      imap_uid         INTEGER UNIQUE,
      cnpj             TEXT NOT NULL,
      operation        TEXT NOT NULL CHECK(operation IN ('in', 'out')),
      name             TEXT NOT NULL,
      type             TEXT NOT NULL CHECK(type IN ('pix', 'ted', 'doc', 'boleto', 'other')),
      person_name      TEXT NOT NULL,
      amount           REAL NOT NULL,
      transaction_date DATETIME NOT NULL,
      parse_sources    TEXT NOT NULL,
      body             TEXT NOT NULL,
      created_at       DATETIME NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS runs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at  DATETIME NOT NULL,
      finished_at DATETIME,
      status      TEXT NOT NULL CHECK(status IN ('running', 'success', 'partial', 'failed')),
      found       INTEGER,
      saved       INTEGER,
      skipped     INTEGER,
      discarded   INTEGER
    );
  `);

  logger.debug("Database opened and table ensured.");
  return db;
}

function insertRun(db, startedAt) {
  const result = db
    .prepare(`
    INSERT INTO runs (started_at, status)
    VALUES (?, 'running')
  `)
    .run(startedAt.toISOString());
  return result.lastInsertRowid;
}

function finishRun(db, runId, status, { found, saved, skipped, discarded }) {
  db.prepare(`
    UPDATE runs SET finished_at = ?, status = ?, found = ?, saved = ?, skipped = ?, discarded = ?
    WHERE id = ?
  `).run(new Date().toISOString(), status, found, saved, skipped, discarded, runId);
}

function getLatestTransactionDate(db) {
  const row = db.prepare(`SELECT MAX(transaction_date) as latest FROM transactions`).get();
  logger.debug(`DB query result for latest transaction_date: ${JSON.stringify(row)}`);

  if (row?.latest) {
    const date = new Date(row.latest);
    date.setDate(date.getDate() - CUTOFF_LOOKBACK_DAYS); // subtrai 2 dias para evitar gaps
    logger.info(`Cutoff date from DB (minus ${CUTOFF_LOOKBACK_DAYS} days): ${date.toISOString()}`);
    return date;
  }

  if (USE_DEBUG_SINCE_DATE) {
    logger.info(
      `[DEBUG] No transactions in DB. Using DEBUG_SINCE_DATE: ${DEBUG_SINCE_DATE.toISOString()}`,
    );
    return DEBUG_SINCE_DATE;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  logger.info(`No transactions in DB. Using today as cutoff: ${today.toISOString()}`);
  return today;
}

function isUidAlreadySaved(db, uid) {
  const row = db.prepare(`SELECT id FROM transactions WHERE imap_uid = ? LIMIT 1`).get(uid);
  return !!row;
}

function insertTransaction(db, tx) {
  db.prepare(`
    INSERT INTO transactions (imap_uid, cnpj, operation, name, type, person_name, amount, transaction_date, parse_sources, body)
    VALUES (@imap_uid, @cnpj, @operation, @name, @type, @person_name, @amount, @transaction_date, @parse_sources, @body)
  `).run(tx);
}

// ─── Email Parser ─────────────────────────────────────────────────────────────

const MONTH_MAP = {
  JAN: 0,
  FEV: 1,
  MAR: 2,
  ABR: 3,
  MAI: 4,
  JUN: 5,
  JUL: 6,
  AGO: 7,
  SET: 8,
  OUT: 9,
  NOV: 10,
  DEZ: 11,
};

function decodeQuotedPrintable(str) {
  return str
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function extractHtmlBody(rawBody) {
  const htmlStart = rawBody.indexOf("<!doctype html");
  if (htmlStart !== -1) {
    return rawBody.slice(htmlStart);
  }
  const htmlStart2 = rawBody.indexOf("<html");
  if (htmlStart2 !== -1) {
    return rawBody.slice(htmlStart2);
  }
  return rawBody;
}

function stripHtmlToText(html) {
  return convert(html, {
    wordwrap: false,
    selectors: [
      { selector: "a", options: { ignoreHref: true } },
      { selector: "img", format: "skip" },
    ],
  });
}

// ── Individual field extractors ──────────────────────────────────────────────

function extractCnpj(decoded) {
  const match =
    decoded.match(/Ol[aá],\s*([^<\n\r]+)/i) || decoded.match(/Ol=C3=A1,\s*([^<\n\r]+)/i);
  if (!match?.[1]) {
    return { value: null, source: "failed" };
  }
  return { value: match[1].trim(), source: "regex" };
}

function extractPersonName(decoded) {
  const match = decoded.match(/Pix de <b>([^<]+)<\/b>e o valor/i);
  if (!match?.[1]) {
    return { value: null, source: "failed" };
  }
  return { value: match[1].trim(), source: "regex" };
}

function extractAmount(decoded) {
  const match = decoded.match(/<strong>R\$\s*([\d.,]+)<\/strong>/i);
  if (!match?.[1]) {
    return { value: null, source: "failed" };
  }
  const amount = parseFloat(match[1].replace(/\./g, "").replace(",", "."));
  if (isNaN(amount) || amount <= 0) {
    return { value: null, source: "failed" };
  }
  return { value: amount, source: "regex" };
}

function extractTransactionDate(rawBody, emailDate) {
  const match =
    rawBody.match(/(\d{1,2})\s+([A-Z]{3})\s*=C3=A0s\s*(\d{2}:\d{2})/i) ||
    rawBody.match(/(\d{1,2})\s+([A-Z]{3})\s*às\s*(\d{2}:\d{2})/i);
  if (!match) {
    return { value: null, source: "failed" };
  }

  const day = parseInt(match[1], 10);
  const month = MONTH_MAP[match[2].toUpperCase()];
  if (month === undefined) {
    return { value: null, source: "failed" };
  }

  const [hour, minute] = match[3].split(":").map(Number);
  const year = new Date(emailDate ?? Date.now()).getFullYear();
  const d = new Date(year, month, day, hour, minute, 0);
  if (isNaN(d.getTime())) {
    return { value: null, source: "failed" };
  }

  return { value: d.toISOString(), source: "regex" };
}

// ── LLM extraction schema ────────────────────────────────────────────────────

const llmExtractionSchema = z.object({
  cnpj: z.string().nullable(),
  person_name: z.string().nullable(),
  amount: z.number().positive().nullable(),
  transaction_date: z.string().datetime().nullable(),
});

async function extractFailedFieldsWithLLM(failedFields, plainText, email) {
  const fieldDescriptions = {
    cnpj: 'partial CNPJ (e.g. "62.462.272") — digits and dots only, no slash or dash',
    person_name: "full name of the person or company that sent the Pix transfer",
    amount: "numeric value of the transfer amount (e.g. 852.00)",
    transaction_date: 'ISO 8601 datetime of the transaction (e.g. "2025-12-26T17:02:00.000Z")',
  };

  const fieldsToExtract = failedFields.map((f) => `- "${f}": ${fieldDescriptions[f]}`).join("\n");

  const prompt = `
You are a data extraction assistant for Brazilian bank email notifications.

Extract the following fields from the email text below:
${fieldsToExtract}

Rules:
- Return ONLY valid JSON with exactly these keys: ${failedFields.map((f) => `"${f}"`).join(", ")}
- If a field cannot be found, return null for that field
- For "amount": return a number, not a string (e.g. 852.00 not "R$ 852,00")
- For "transaction_date": return ISO 8601 format in UTC
- For "cnpj": return only the partial number as shown (e.g. "62.462.272")
- Do NOT add explanations
- Return ONLY valid JSON

Email text:
${plainText.slice(0, 3000)}
`;

  logger.warn(`[LLM] Extracting fields [${failedFields.join(", ")}] for uid=${email.uid}`);

  try {
    const result = await aiClient.generateStructured({
      prompt,
      schema: llmExtractionSchema.pick(Object.fromEntries(failedFields.map((f) => [f, true]))),
      temperature: 0.1,
    });

    logger.info(`[LLM] Extraction result for uid=${email.uid}: ${JSON.stringify(result)}`);
    return result;
  } catch (err) {
    logger.error(`[LLM] Extraction failed for uid=${email.uid}: ${err.message}`);
    return null;
  }
}

// ── Main parse orchestrator ───────────────────────────────────────────────────

async function parseEmail(email) {
  const rawBody = email.body ?? "";
  const htmlBody = extractHtmlBody(rawBody);
  const decoded = decodeQuotedPrintable(htmlBody);
  const plainText = stripHtmlToText(decoded);
  const bodyForStorage = htmlBody.slice(0, BODY_MAX_LENGTH);

  // ── Regex extraction
  let cnpjResult = extractCnpj(decoded);
  let personNameResult = extractPersonName(decoded);
  let amountResult = extractAmount(decoded);
  let transactionDateResult = extractTransactionDate(htmlBody, email.date);

  // // 🧪 FORCE LLM TEST — remove after testing
  // cnpjResult            = { value: null, source: 'failed' };
  // personNameResult      = { value: null, source: 'failed' };
  // amountResult          = { value: null, source: 'failed' };
  // transactionDateResult = { value: null, source: 'failed' };

  const operation = "in";
  const type = "pix";
  const name = "Nubank Pagamentos S.A.";

  logger.debug(
    `uid=${email.uid} regex: cnpj=${cnpjResult.source} person=${personNameResult.source} amount=${amountResult.source} date=${transactionDateResult.source}`,
  );

  // ── Identify failed fields
  const failedFields = [];
  if (cnpjResult.source === "failed") {
    failedFields.push("cnpj");
  }
  if (personNameResult.source === "failed") {
    failedFields.push("person_name");
  }
  if (amountResult.source === "failed") {
    failedFields.push("amount");
  }
  if (transactionDateResult.source === "failed") {
    failedFields.push("transaction_date");
  }

  // ── Delegate ALL failed fields to LLM in a single call
  if (failedFields.length > 0) {
    logger.warn(
      `uid=${email.uid} — regex failed for: [${failedFields.join(", ")}]. Delegating to LLM...`,
    );

    const llmResult = await extractFailedFieldsWithLLM(failedFields, plainText, email);

    if (llmResult) {
      if (failedFields.includes("cnpj") && llmResult.cnpj != null) {
        cnpjResult = { value: llmResult.cnpj, source: "llm" };
      }
      if (failedFields.includes("person_name") && llmResult.person_name != null) {
        personNameResult = { value: llmResult.person_name, source: "llm" };
      }
      if (failedFields.includes("amount") && llmResult.amount != null) {
        amountResult = { value: llmResult.amount, source: "llm" };
      }
      if (failedFields.includes("transaction_date") && llmResult.transaction_date != null) {
        transactionDateResult = { value: llmResult.transaction_date, source: "llm" };
      }
    }
  }

  // ── Check if any field is still null after LLM
  const stillFailed = [];
  if (cnpjResult.value === null) {
    stillFailed.push("cnpj");
  }
  if (personNameResult.value === null) {
    stillFailed.push("person_name");
  }
  if (amountResult.value === null) {
    stillFailed.push("amount");
  }
  if (transactionDateResult.value === null) {
    stillFailed.push("transaction_date");
  }

  if (stillFailed.length > 0) {
    const msg = `uid=${email.uid} — extraction failed after LLM for: [${stillFailed.join(", ")}]. Discarding.`;
    logger.error(msg);
    await notifyDiscord(`❌ check-nubank-emails: ${msg}`);
    return null;
  }

  const parse_sources = JSON.stringify({
    cnpj: cnpjResult.source,
    person_name: personNameResult.source,
    amount: amountResult.source,
    transaction_date: transactionDateResult.source,
  });

  logger.info(
    `uid=${email.uid} parsed OK — person=${personNameResult.value} amount=${amountResult.value} cnpj=${cnpjResult.value} date=${transactionDateResult.value}`,
  );

  return {
    cnpj: cnpjResult.value,
    operation,
    name,
    type,
    person_name: personNameResult.value,
    amount: amountResult.value,
    transaction_date: transactionDateResult.value,
    parse_sources,
    body: bodyForStorage,
  };
}

// ─── IMAP ────────────────────────────────────────────────────────────────────

async function fetchEmailsFromImap(cutoffDate) {
  let lastError;

  for (let attempt = 1; attempt <= RETRY_CONFIG.attempts; attempt++) {
    const client = new ImapFlow(IMAP_CONFIG);

    try {
      logger.info(`IMAP connection attempt ${attempt}/${RETRY_CONFIG.attempts}...`);
      await client.connect();
      logger.debug("IMAP connected successfully.");

      const lock = await client.getMailboxLock("INBOX");

      try {
        const allMessages = await client.search({ all: true });
        logger.debug(`Total messages in INBOX (no filter): ${allMessages.length}`);
        const bySender = await client.search({ from: SEARCH_CONFIG.email });
        logger.debug(`Messages matching from="${SEARCH_CONFIG.email}": ${bySender.length}`);
        const byDate = await client.search({ since: cutoffDate });
        logger.debug(`Messages matching since=${cutoffDate.toISOString()}: ${byDate.length}`);

        // IMAP filter: from + since only (subject filtered locally for reliability)
        const filter = { from: SEARCH_CONFIG.email, since: cutoffDate };
        logger.debug(
          `Applying IMAP filter: from="${SEARCH_CONFIG.email}" since=${cutoffDate.toISOString()}`,
        );

        const messageIds = await client.search(filter);
        logger.info(`Found ${messageIds.length} candidate(s) from IMAP filter.`);

        const emails = [];
        const subjectsSeen = new Set();

        for await (const msg of client.fetch(messageIds, { envelope: true, source: true })) {
          const subject = msg.envelope.subject ?? "";
          const subjectLower = subject.toLowerCase();

          // Local subject filter
          if (!subjectLower.includes(SEARCH_CONFIG.subjectContains)) {
            logger.debug(`uid=${msg.uid} skipped — subject does not match: "${subject}"`);
            continue;
          }

          // // Detect unexpected subject variation
          // if (!subjectLower.includes(SEARCH_CONFIG.subjectExpected)) {
          //   logger.warn(`uid=${msg.uid} — unexpected subject variation: "${subject}"`);
          //   await notifyDiscord(
          //     `⚠️ check-nubank-emails: New subject variation: "${subject}" — review needed`,
          //   );
          // }

          subjectsSeen.add(subject);
          const body = msg.source?.toString("utf8") ?? "";
          logger.debug(
            `Fetched uid=${msg.uid} subject="${subject}" date=${String(msg.envelope.date)}`,
          );

          emails.push({
            uid: msg.uid,
            subject,
            from: msg.envelope.from?.map((f) => `${f.name} <${f.mailbox}@${f.host}>`).join(", "),
            date: msg.envelope.date,
            body,
          });
        }

        logger.info(`Matched ${emails.length} email(s) after local subject filter.`);
        logger.info(`Subjects seen this run: ${[...subjectsSeen].join(" | ") || "none"}`);

        return emails;
      } finally {
        lock.release();
        await client.logout();
        logger.debug("IMAP disconnected.");
      }
    } catch (err) {
      lastError = err;
      logger.error(`IMAP attempt ${attempt} failed: ${err.message}`);

      if (attempt < RETRY_CONFIG.attempts) {
        const delay = RETRY_CONFIG.delays[attempt - 1];
        logger.info(`Retrying in ${delay / 1000}s...`);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // throw new Error('teste de notificação Discord'); // 🧪 remove after testing
  logger.info("=== check-nubank-emails started ===");

  let db;
  try {
    db = openDatabase();
  } catch (err) {
    logger.error(`Failed to open database: ${err.message}`);
    await notifyDiscord(`❌ check-nubank-emails: Failed to open database — ${err.message}`);
    process.exit(1); // sem banco não tem nada a fazer
  }

  const startedAt = new Date();
  const runId = insertRun(db, startedAt);

  const cutoffDate = getLatestTransactionDate(db);

  let emails = [];
  try {
    emails = await fetchEmailsFromImap(cutoffDate);
  } catch (err) {
    logger.error(`IMAP failed after all retries: ${err.message}`);
    await notifyDiscord(`❌ check-nubank-emails: IMAP failed after all retries — ${err.message}`);
    finishRun(db, runId, "failed", { found: 0, saved: 0, skipped: 0, discarded: 0 });
    db.close();
    return; // não aborta o processo, termina graciosamente
  }

  let saved = 0;
  let skipped = 0;
  let discarded = 0;

  for (const email of emails) {
    logger.debug(`Processing uid=${email.uid} from="${email.from}" date=${String(email.date)}`);

    if (isUidAlreadySaved(db, email.uid)) {
      logger.debug(`Skipping uid=${email.uid} — already in database.`);
      skipped++;
      continue;
    }

    let parsed;
    try {
      parsed = await parseEmail(email);
    } catch (err) {
      logger.error(`Unexpected error parsing uid=${email.uid}: ${err.message}`);
      await notifyDiscord(
        `❌ check-nubank-emails: Unexpected parse error uid=${email.uid} — ${err.message}`,
      );
      discarded++;
      continue;
    }

    if (parsed === null) {
      discarded++;
      continue;
    }

    try {
      insertTransaction(db, { imap_uid: email.uid, ...parsed });
      logger.info(
        `Saved uid=${email.uid} — ${parsed.person_name} R$${parsed.amount} sources=${parsed.parse_sources}`,
      );
      await notifyDiscord(
        `✅ **Nova transação salva**\n` +
          `👤 **Pessoa:** ${parsed.person_name}\n` +
          `💰 **Valor:** R$ ${parsed.amount.toFixed(2)}\n` +
          `🏦 **CNPJ:** ${parsed.cnpj}\n` +
          `📋 **Tipo:** ${parsed.type.toUpperCase()} (${parsed.operation === "in" ? "entrada" : "saída"})\n` +
          `📅 **Data:** ${new Date(parsed.transaction_date).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}\n` +
          `🔍 **Fontes:** ${parsed.parse_sources}\n` +
          `🆔 **UID IMAP:** ${email.uid}`,
      );
      saved++;
    } catch (err) {
      logger.error(`Failed to insert uid=${email.uid}: ${err.message}`);
      await notifyDiscord(
        `❌ check-nubank-emails: Failed to insert uid=${email.uid} — ${err.message}`,
      );
      discarded++;
    }
  }

  const status = discarded > 0 ? "partial" : "success";
  finishRun(db, runId, status, { found: emails.length, saved, skipped, discarded });
  db.close();

  logger.info(
    `=== Done. Found: ${emails.length} | Saved: ${saved} | Skipped: ${skipped} | Discarded: ${discarded} ===`,
  );
}

main().catch(async (err) => {
  logger.error(`Unexpected error: ${err.message}`);
  await notifyDiscord(`❌ check-nubank-emails: Unexpected error — ${err.message}`);
  // não chama process.exit — termina graciosamente
});
