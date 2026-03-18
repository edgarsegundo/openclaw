// https://claude.ai/chat/70e232ac-111b-4709-bcd0-54375cc5c6ff
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

const DISCORD_ONLY_RECEIVED = true;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, ".env") });

// ─── CLI Args ─────────────────────────────────────────────────────────────────

function parseSinceArg() {
  const idx = process.argv.indexOf("--since");
  if (idx === -1) {
    return null;
  }

  const raw = process.argv[idx + 1];
  if (!raw) {
    throw new Error("--since requires a value (e.g. --since 30d or --since 2025-01-01)");
  }

  // Formato relativo: 30d, 7d, 1d, etc.
  const relMatch = raw.match(/^(\d+)d$/i);
  if (relMatch) {
    const days = parseInt(relMatch[1], 10);
    const date = new Date();
    date.setDate(date.getDate() - days);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  // Formato absoluto: 2025-01-01 ou 2025-01-01T00:00:00
  const date = new Date(raw);
  if (isNaN(date.getTime())) {
    throw new Error(`--since value invalid: "${raw}"`);
  }
  return date;
}

const CLI_SINCE = parseSinceArg();

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
  // Filtra apenas pelo sender no IMAP — amplo e estável independente de templates
  email: "todomundo@nubank.com.br",

  // Subjects conhecidos que devem ser PROCESSADOS (transferências recebidas)
  knownReceived: [
    "você recebeu uma transferência pelo pix",
    "transferência recebida",
    "voce recebeu uma transferencia pelo pix", // variação sem acento
  ],

  // Subjects conhecidos que devem ser IGNORADOS silenciosamente
  knownIgnored: [
    "transferência realizada com sucesso",
    "comprovante de pagamento",
    "sua fatura",
    "fatura disponível",
    "seu boleto",
    "limite aprovado",
    "bem-vindo",
  ],
};

const DEBUG_SINCE_DATE = new Date("2025-12-26T00:00:00.000-03:00"); // TODO: remove before production
const USE_DEBUG_SINCE_DATE = false; // TODO: set to false before production

const CUTOFF_LOOKBACK_DAYS = 2; // subtrai X dias do cutoff para evitar gaps

const RETRY_CONFIG = {
  attempts: 3,
  delays: [30_000, 60_000, 120_000],
};

const businessId = process.env.FASTVISTOS_BUSINESS_ID;
const apiBaseUrl = process.env.FASTVISTOS_API_URL || "https://sys.fastvistos.com.br/api";
const apiKey = process.env.FASTVISTOS_API_KEY;

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
//
// Tipos aceitos:
//   "received" → transferência recebida confirmada
//   "error"    → erro crítico que precisa de atenção
//
// Qualquer outro tipo é silenciado quando DISCORD_ONLY_RECEIVED = true.

async function notifyDiscord(message, type = "info") {
  if (DISCORD_ONLY_RECEIVED && type !== "received" && type !== "error") {
    return;
  }

  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    logger.warn("DISCORD_WEBHOOK_URL not set, skipping notification");
    return;
  }

  const separator = "━━━━━━━━━━━━━━━━━━━━━━━";
  const formattedMessage = `${separator}\n${message}`;

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: formattedMessage }),
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
      is_sync          INTEGER NOT NULL DEFAULT 0,
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

  db.exec(`
    CREATE TABLE IF NOT EXISTS seen_uids (
      imap_uid   INTEGER PRIMARY KEY,
      reason     TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
  `);

  // Migration: add is_sync column if it doesn't exist (for existing databases)
  const columns = db.prepare("PRAGMA table_info(transactions)").all();
  const hasIsSync = columns.some((col) => col.name === "is_sync");
  if (!hasIsSync) {
    logger.info("Migrating DB: adding is_sync column to transactions table.");
    db.exec(`ALTER TABLE transactions ADD COLUMN is_sync INTEGER NOT NULL DEFAULT 0`);
  }

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
  // Flag --since tem prioridade máxima sobre qualquer outra lógica
  if (CLI_SINCE) {
    logger.info(`[CLI] --since override: using ${CLI_SINCE.toISOString()}`);
    return CLI_SINCE;
  }

  const row = db.prepare(`SELECT MAX(transaction_date) as latest FROM transactions`).get();
  logger.debug(`DB query result for latest transaction_date: ${JSON.stringify(row)}`);

  if (row?.latest) {
    const date = new Date(row.latest);
    date.setDate(date.getDate() - CUTOFF_LOOKBACK_DAYS);
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
  const inTx = db.prepare(`SELECT id FROM transactions WHERE imap_uid = ? LIMIT 1`).get(uid);
  if (inTx) {
    return true;
  }
  const inSeen = db.prepare(`SELECT imap_uid FROM seen_uids WHERE imap_uid = ? LIMIT 1`).get(uid);
  return !!inSeen;
}

function markUidAsSeen(db, uid, reason) {
  db.prepare(`INSERT OR IGNORE INTO seen_uids (imap_uid, reason) VALUES (?, ?)`).run(uid, reason);
}

function insertTransaction(db, tx) {
  db.prepare(`
    INSERT INTO transactions (imap_uid, cnpj, operation, name, type, person_name, amount, transaction_date, parse_sources, body, is_sync)
    VALUES (@imap_uid, @cnpj, @operation, @name, @type, @person_name, @amount, @transaction_date, @parse_sources, @body, @is_sync)
  `).run(tx);
}

function updateIsSync(db, imapUid, isSync) {
  db.prepare(`UPDATE transactions SET is_sync = ? WHERE imap_uid = ?`).run(isSync ? 1 : 0, imapUid);
}

function getPendingSyncTransactions(db) {
  return db.prepare(`SELECT * FROM transactions WHERE is_sync = 0`).all();
}

// ─── Subject Classification ───────────────────────────────────────────────────

function classifySubject(subject) {
  const lower = subject.toLowerCase().trim();

  for (const known of SEARCH_CONFIG.knownReceived) {
    if (lower.includes(known)) {
      return "received";
    }
  }

  for (const known of SEARCH_CONFIG.knownIgnored) {
    if (lower.includes(known)) {
      return "ignored";
    }
  }

  return "unknown";
}

// ─── External API ─────────────────────────────────────────────────────────────

async function syncTransactionToApi(tx) {
  if (!apiKey) {
    logger.warn("FASTVISTOS_API_KEY not set, skipping external sync");
    return false;
  }

  if (!businessId) {
    logger.warn("FASTVISTOS_BUSINESS_ID not set, skipping external sync");
    return false;
  }

  const url = `${apiBaseUrl}/transactions/create/`;

  const payload = {
    business_id: businessId,
    imap_uid: tx.imap_uid,
    cnpj: tx.cnpj,
    operation: tx.operation,
    name: tx.name,
    type: tx.type,
    person_name: tx.person_name,
    amount: tx.amount,
    transaction_date: tx.transaction_date,
    parse_sources: tx.parse_sources,
    body: tx.body,
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 201) {
      logger.info(`[API] Transaction synced successfully — imap_uid=${tx.imap_uid}`);
      return true;
    }

    const body = await res.text();
    logger.error(
      `[API] Sync failed for imap_uid=${tx.imap_uid} — status=${res.status} body=${body}`,
    );
    return false;
  } catch (err) {
    logger.error(`[API] Sync error for imap_uid=${tx.imap_uid} — ${err.message}`);
    return false;
  }
}

// ─── Resync pending transactions ──────────────────────────────────────────────

async function resyncPendingTransactions(db) {
  const pending = getPendingSyncTransactions(db);

  if (pending.length === 0) {
    logger.info("[Resync] No pending transactions to sync.");
    return;
  }

  logger.info(
    `[Resync] Found ${pending.length} transaction(s) with is_sync=false. Attempting resync...`,
  );

  let resynced = 0;
  for (const tx of pending) {
    const success = await syncTransactionToApi(tx);
    if (success) {
      updateIsSync(db, tx.imap_uid, true);
      resynced++;
      logger.info(`[Resync] imap_uid=${tx.imap_uid} synced and marked is_sync=true`);
    } else {
      logger.warn(`[Resync] imap_uid=${tx.imap_uid} still failed, keeping is_sync=false`);
      // Alerta de falha de resync — pode indicar API fora do ar ou problema persistente
      await notifyDiscord(
        `❌ **Falha de sync com API (resync)**\n` +
          `🆔 **UID IMAP:** ${tx.imap_uid}\n` +
          `👤 **Pessoa:** ${tx.person_name}\n` +
          `💰 **Valor:** R$ ${Number(tx.amount).toFixed(2)}\n` +
          `📅 **Data transação:** ${new Date(tx.transaction_date).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}\n` +
          `⚠️ A transação está salva localmente mas não chegou à API. Verifique a conectividade.`,
        "error",
      );
    }
  }

  logger.info(`[Resync] Done. Resynced: ${resynced}/${pending.length}`);
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

// ── LLM: fallback total ───────────────────────────────────────────────────────

const llmFullExtractionSchema = z.object({
  is_received_transfer: z.boolean(),
  cnpj: z.string().nullable(),
  person_name: z.string().nullable(),
  amount: z.number().positive().nullable(),
  transaction_date: z.string().datetime().nullable(),
});

async function fullLlmExtraction(plainText, email, reason) {
  const prompt = `
You are a data extraction assistant for Brazilian bank (Nubank) email notifications.

Your task:
1. Determine if this email is a PIX RECEIVED notification (money coming IN to the account).
2. If yes, extract the required fields.

Return ONLY valid JSON with these keys:
- "is_received_transfer": true if this is an incoming PIX transfer, false otherwise
- "cnpj": partial CNPJ of the account owner (e.g. "62.462.272"), or null
- "person_name": full name of the person or company that SENT the Pix, or null
- "amount": numeric transfer amount (e.g. 852.00), or null
- "transaction_date": ISO 8601 datetime in UTC, or null

If "is_received_transfer" is false, set all other fields to null.
Do NOT add explanations. Return ONLY valid JSON.

Reason this email is being analyzed by LLM: ${reason}

Email text:
${plainText.slice(0, 4000)}
`;

  logger.warn(`[LLM-FULL] Full extraction for uid=${email.uid} — reason: ${reason}`);

  try {
    const result = await aiClient.generateStructured({
      prompt,
      schema: llmFullExtractionSchema,
      temperature: 0.1,
    });
    logger.info(`[LLM-FULL] Result for uid=${email.uid}: ${JSON.stringify(result)}`);
    return result;
  } catch (err) {
    logger.error(`[LLM-FULL] Failed for uid=${email.uid}: ${err.message}`);
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

  let cnpjResult = extractCnpj(decoded);
  let personNameResult = extractPersonName(decoded);
  let amountResult = extractAmount(decoded);
  let transactionDateResult = extractTransactionDate(htmlBody, email.date);

  const operation = "in";
  const type = "pix";
  const name = "Nubank Pagamentos S.A.";

  logger.debug(
    `uid=${email.uid} regex: cnpj=${cnpjResult.source} person=${personNameResult.source} amount=${amountResult.source} date=${transactionDateResult.source}`,
  );

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

  // Se todos os 4 campos falharam, ir direto pro LLM completo
  if (failedFields.length === 4) {
    logger.warn(`uid=${email.uid} — all regex fields failed, using full LLM extraction`);
    const llmResult = await fullLlmExtraction(plainText, email, "all regex fields failed");

    if (!llmResult || !llmResult.is_received_transfer) {
      logger.warn(`uid=${email.uid} — LLM confirmed not a received transfer. Discarding.`);
      return null;
    }

    cnpjResult = { value: llmResult.cnpj, source: "llm" };
    personNameResult = { value: llmResult.person_name, source: "llm" };
    amountResult = { value: llmResult.amount, source: "llm" };
    transactionDateResult = { value: llmResult.transaction_date, source: "llm" };
  } else if (failedFields.length > 0) {
    // Alguns campos falharam — LLM parcial
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
    await notifyDiscord(`❌ check-nubank-emails: ${msg}`, "error");
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
        const filter = {
          from: SEARCH_CONFIG.email,
          since: cutoffDate,
        };
        logger.debug(
          `Applying IMAP filter: from="${SEARCH_CONFIG.email}" since=${cutoffDate.toISOString()}`,
        );

        const messageIds = await client.search(filter);
        logger.info(`Found ${messageIds.length} candidate(s) from IMAP filter (sender only).`);

        const emails = [];

        for await (const msg of client.fetch(messageIds, { envelope: true, source: true })) {
          const subject = msg.envelope.subject ?? "";
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

        logger.info(`Fetched ${emails.length} email(s) from sender.`);
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
  logger.info("=== check-nubank-emails started ===");

  let db;
  try {
    db = openDatabase();
  } catch (err) {
    logger.error(`Failed to open database: ${err.message}`);
    await notifyDiscord(
      `❌ **Falha crítica — banco de dados**\n` + `Não foi possível abrir o SQLite: ${err.message}`,
      "error",
    );
    process.exit(1);
  }

  const startedAt = new Date();
  const runId = insertRun(db, startedAt);

  const cutoffDate = getLatestTransactionDate(db);

  let emails = [];
  try {
    emails = await fetchEmailsFromImap(cutoffDate);
  } catch (err) {
    logger.error(`IMAP failed after all retries: ${err.message}`);
    await notifyDiscord(
      `❌ **Falha crítica — IMAP**\n` + `Todas as tentativas de conexão falharam: ${err.message}`,
      "error",
    );
    finishRun(db, runId, "failed", { found: 0, saved: 0, skipped: 0, discarded: 0 });
    db.close();
    return;
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

    const classification = classifySubject(email.subject);
    logger.debug(
      `uid=${email.uid} subject="${email.subject}" → classification="${classification}"`,
    );

    if (classification === "ignored") {
      logger.debug(`uid=${email.uid} — subject is known-ignored. Skipping.`);
      skipped++;
      continue;
    }

    if (classification === "unknown") {
      // Subject nunca visto — tentar LLM completo sem alertar ainda
      logger.warn(`uid=${email.uid} — UNKNOWN subject: "${email.subject}"`);

      const rawBody = email.body ?? "";
      const htmlBody = extractHtmlBody(rawBody);
      const decoded = decodeQuotedPrintable(htmlBody);
      const plainText = stripHtmlToText(decoded);

      const llmResult = await fullLlmExtraction(
        plainText,
        email,
        `unknown subject: "${email.subject}"`,
      );

      if (!llmResult || !llmResult.is_received_transfer) {
        // LLM confirmou que NÃO é transferência recebida — descartar silenciosamente
        logger.warn(
          `uid=${email.uid} — LLM says not a received transfer. Skipping (no Discord alert).`,
        );
        markUidAsSeen(db, email.uid, "unknown_not_transfer");
        skipped++;
        continue;
      }

      // LLM confirmou transferência recebida — verificar campos extraídos
      const stillFailed = [
        !llmResult.cnpj && "cnpj",
        !llmResult.person_name && "person_name",
        !llmResult.amount && "amount",
        !llmResult.transaction_date && "transaction_date",
      ].filter(Boolean);

      if (stillFailed.length > 0) {
        const msg =
          `uid=${email.uid} — LLM confirmou transferência recebida (subject desconhecido: "${email.subject}") ` +
          `mas não extraiu [${stillFailed.join(", ")}]. Descartado.`;
        logger.error(msg);
        await notifyDiscord(
          `❌ **Transferência recebida não processada**\n` +
            `📧 **Subject desconhecido:** ${email.subject}\n` +
            `🆔 **UID IMAP:** ${email.uid}\n` +
            `⚠️ **Campos ausentes:** ${stillFailed.join(", ")}\n` +
            `O e-mail parece ser uma transferência recebida mas o LLM não conseguiu extrair os dados. ` +
            `Adicione o subject a \`knownReceived\` no SEARCH_CONFIG.`,
          "error",
        );
        markUidAsSeen(db, email.uid, "unknown_llm_extract_failed");
        discarded++;
        continue;
      }

      const bodyForStorage = (email.body ?? "").slice(0, BODY_MAX_LENGTH);
      const parse_sources = JSON.stringify({
        cnpj: "llm",
        person_name: "llm",
        amount: "llm",
        transaction_date: "llm",
      });

      const parsed = {
        cnpj: llmResult.cnpj,
        operation: "in",
        name: "Nubank Pagamentos S.A.",
        type: "pix",
        person_name: llmResult.person_name,
        amount: llmResult.amount,
        transaction_date: llmResult.transaction_date,
        parse_sources,
        body: bodyForStorage,
      };

      try {
        insertTransaction(db, { imap_uid: email.uid, ...parsed, is_sync: 0 });
        saved++;

        const synced = await syncTransactionToApi({ imap_uid: email.uid, ...parsed });
        if (synced) {
          updateIsSync(db, email.uid, true);
        } else {
          // Falha de sync notificada pelo resyncPendingTransactions no próximo run,
          // mas aqui alertamos imediatamente pois acabou de acontecer
          await notifyDiscord(
            `❌ **Falha de sync com API**\n` +
              `🆔 **UID IMAP:** ${email.uid}\n` +
              `👤 **Pessoa:** ${parsed.person_name}\n` +
              `💰 **Valor:** R$ ${parsed.amount.toFixed(2)}\n` +
              `⚠️ Transação salva localmente mas não chegou à API. Será reprocessada no próximo run.`,
            "error",
          );
        }

        // Notificação de transferência recebida — inclui aviso de subject novo
        await notifyDiscord(
          `✅ **Nova transferência recebida**\n` +
            `👤 **Pessoa:** ${parsed.person_name}\n` +
            `💰 **Valor:** R$ ${parsed.amount.toFixed(2)}\n` +
            `🏦 **CNPJ:** ${parsed.cnpj}\n` +
            `📅 **Data:** ${new Date(parsed.transaction_date).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}\n` +
            `🔗 **Sync:** ${synced ? "✅" : "⏳ pendente"}\n` +
            `🆔 **UID IMAP:** ${email.uid}\n` +
            `⚠️ **Atenção:** subject desconhecido detectado — considere adicionar "${email.subject}" ao SEARCH_CONFIG.`,
          "received",
        );
      } catch (err) {
        logger.error(`Failed to insert uid=${email.uid}: ${err.message}`);
        await notifyDiscord(
          `❌ **Erro ao salvar transação**\n` +
            `🆔 **UID IMAP:** ${email.uid}\n` +
            `💥 **Erro:** ${err.message}`,
          "error",
        );
        markUidAsSeen(db, email.uid, "unknown_insert_failed");
        discarded++;
      }

      continue;
    }

    // ── classification === "received" — fluxo normal ──────────────────────────
    let parsed;
    try {
      parsed = await parseEmail(email);
    } catch (err) {
      logger.error(`Unexpected error parsing uid=${email.uid}: ${err.message}`);
      await notifyDiscord(
        `❌ **Erro inesperado ao processar e-mail**\n` +
          `🆔 **UID IMAP:** ${email.uid}\n` +
          `💥 **Erro:** ${err.message}`,
        "error",
      );
      discarded++;
      continue;
    }

    if (parsed === null) {
      discarded++;
      continue;
    }

    try {
      insertTransaction(db, { imap_uid: email.uid, ...parsed, is_sync: 0 });
      logger.info(
        `Saved uid=${email.uid} — ${parsed.person_name} R$${parsed.amount} sources=${parsed.parse_sources}`,
      );
      saved++;

      const synced = await syncTransactionToApi({ imap_uid: email.uid, ...parsed });
      if (synced) {
        updateIsSync(db, email.uid, true);
        logger.info(`uid=${email.uid} — is_sync set to true`);
      } else {
        logger.warn(`uid=${email.uid} — external sync failed, is_sync remains false`);
        await notifyDiscord(
          `❌ **Falha de sync com API**\n` +
            `🆔 **UID IMAP:** ${email.uid}\n` +
            `👤 **Pessoa:** ${parsed.person_name}\n` +
            `💰 **Valor:** R$ ${parsed.amount.toFixed(2)}\n` +
            `⚠️ Transação salva localmente mas não chegou à API. Será reprocessada no próximo run.`,
          "error",
        );
      }

      await notifyDiscord(
        `✅ **Nova transferência recebida**\n` +
          `👤 **Pessoa:** ${parsed.person_name}\n` +
          `💰 **Valor:** R$ ${parsed.amount.toFixed(2)}\n` +
          `🏦 **CNPJ:** ${parsed.cnpj}\n` +
          `📋 **Tipo:** ${parsed.type.toUpperCase()} (${parsed.operation === "in" ? "entrada" : "saída"})\n` +
          `📅 **Data:** ${new Date(parsed.transaction_date).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}\n` +
          `🔍 **Fontes:** ${parsed.parse_sources}\n` +
          `🔗 **Sync:** ${synced ? "✅" : "⏳ pendente"}\n` +
          `🆔 **UID IMAP:** ${email.uid}`,
        "received",
      );
    } catch (err) {
      logger.error(`Failed to insert uid=${email.uid}: ${err.message}`);
      await notifyDiscord(
        `❌ **Erro ao salvar transação**\n` +
          `🆔 **UID IMAP:** ${email.uid}\n` +
          `💥 **Erro:** ${err.message}`,
        "error",
      );
      discarded++;
    }
  }

  const status = discarded > 0 ? "partial" : "success";
  finishRun(db, runId, status, { found: emails.length, saved, skipped, discarded });

  // Sempre tenta resync de pendências de runs anteriores
  await resyncPendingTransactions(db);

  db.close();

  logger.info(
    `=== Done. Found: ${emails.length} | Saved: ${saved} | Skipped: ${skipped} | Discarded: ${discarded} ===`,
  );
}

main().catch(async (err) => {
  logger.error(`Unexpected error: ${err.message}`);
  await notifyDiscord(`❌ **Erro crítico inesperado**\n💥 **Erro:** ${err.message}`, "error");
});
