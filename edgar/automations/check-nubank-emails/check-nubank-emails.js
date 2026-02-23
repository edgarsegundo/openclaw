"use strict";

const { ImapFlow } = require("imapflow");
const Database = require("better-sqlite3");
const { convert } = require("html-to-text");
const path = require("path");
const winston = require("winston");
require("winston-daily-rotate-file");
require("dotenv").config({ path: path.join(__dirname, ".env") });

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
  subject: "Você recebeu uma transferência pelo Pix",
};

const DEBUG_SINCE_DATE = new Date("2025-12-26T00:00:00.000-03:00"); // TODO: remove before production
const USE_DEBUG_SINCE_DATE = true; // TODO: set to false before production

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

// ─── Discord Notification (mockup) ───────────────────────────────────────────

async function notifyDiscord(message) {
  // TODO: implement Discord webhook notification
  // const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  // await fetch(webhookUrl, { method: 'POST', body: JSON.stringify({ content: message }) });
  logger.warn(`[DISCORD MOCKUP] ${message}`);
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
    )
  `);

  logger.debug("Database opened and table ensured.");
  return db;
}

function getLatestTransactionDate(db) {
  const row = db.prepare(`SELECT MAX(transaction_date) as latest FROM transactions`).get();
  logger.debug(`DB query result for latest transaction_date: ${JSON.stringify(row)}`);

  if (row?.latest) {
    const date = new Date(row.latest);
    logger.info(`Cutoff date from DB: ${date.toISOString()}`);
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

// Extract HTML body (strip SMTP headers)
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

// Strip HTML to plain text for LLM
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

function extractCnpj(rawBody) {
  const match = rawBody.match(/^To:\s*([\d.]+)\s*</m);
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

function extractTransactionDate(decoded, emailDate) {
  const match = decoded.match(/(\d{1,2})\s+([A-Z]{3})\s*(?:às|=C3=A0s)\s*(\d{2}:\d{2})/i);
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

// ── LLM fallback stub ────────────────────────────────────────────────────────

async function extractWithLLM(fieldName, plainText, email) {
  // TODO: implement real LLM extraction
  // Example fields: 'cnpj', 'person_name', 'amount', 'transaction_date'
  logger.warn(`[LLM STUB] Would extract field="${fieldName}" from email uid=${email.uid}`);
  logger.debug(`[LLM STUB] Plain text snippet:\n${plainText.slice(0, 500)}`);
  return { value: null, source: "failed" };
}

// ── Main parse orchestrator ───────────────────────────────────────────────────

async function parseEmail(email) {
  const rawBody = email.body ?? "";
  const htmlBody = extractHtmlBody(rawBody);
  const decoded = decodeQuotedPrintable(htmlBody);
  const plainText = stripHtmlToText(decoded);

  // Truncated HTML body for storage (no SMTP headers)
  const bodyForStorage = htmlBody.slice(0, BODY_MAX_LENGTH);

  // ── Extract all fields
  let cnpjResult = extractCnpj(rawBody);
  let personNameResult = extractPersonName(decoded);
  let amountResult = extractAmount(decoded);
  let transactionDateResult = extractTransactionDate(decoded, email.date);

  // ── Fixed fields (no extraction needed)
  const operation = "in";
  const type = "pix";
  const name = "Nubank Pagamentos S.A.";

  // ── Log extraction results
  logger.debug(
    `uid=${email.uid} extraction: cnpj=${cnpjResult.source} person=${personNameResult.source} amount=${amountResult.source} date=${transactionDateResult.source}`,
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

  // ── Delegate failed fields to LLM
  if (failedFields.length > 0) {
    logger.warn(
      `uid=${email.uid} — regex failed for fields: [${failedFields.join(", ")}]. Delegating to LLM...`,
    );

    for (const field of failedFields) {
      let llmResult;
      if (field === "cnpj") {
        llmResult = await extractWithLLM("cnpj", plainText, email);
        cnpjResult = llmResult;
      }
      if (field === "person_name") {
        llmResult = await extractWithLLM("person_name", plainText, email);
        personNameResult = llmResult;
      }
      if (field === "amount") {
        llmResult = await extractWithLLM("amount", plainText, email);
        amountResult = llmResult;
      }
      if (field === "transaction_date") {
        llmResult = await extractWithLLM("transaction_date", plainText, email);
        transactionDateResult = llmResult;
      }
    }
  }

  // ── Check if any field is still failed after LLM
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
    const msg = `uid=${email.uid} — extraction failed after LLM for fields: [${stillFailed.join(", ")}]. Discarding.`;
    logger.error(msg);
    await notifyDiscord(`❌ check-nubank-emails: ${msg}`);
    return null;
  }

  // ── Build parse_sources JSON
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
        // Debug searches
        const allMessages = await client.search({ all: true });
        logger.debug(`Total messages in INBOX (no filter): ${allMessages.length}`);
        const bySender = await client.search({ from: SEARCH_CONFIG.email });
        logger.debug(`Messages matching from="${SEARCH_CONFIG.email}": ${bySender.length}`);
        const bySubject = await client.search({ subject: SEARCH_CONFIG.subject });
        logger.debug(`Messages matching subject="${SEARCH_CONFIG.subject}": ${bySubject.length}`);
        const byDate = await client.search({ since: cutoffDate });
        logger.debug(`Messages matching since=${cutoffDate.toISOString()}: ${byDate.length}`);

        const filter = {
          from: SEARCH_CONFIG.email,
          subject: SEARCH_CONFIG.subject,
          since: cutoffDate,
        };
        logger.debug(
          `Applying combined filter: ${JSON.stringify({ ...filter, since: cutoffDate.toISOString() })}`,
        );

        const messageIds = await client.search(filter);
        logger.info(`Found ${messageIds.length} matching message(s) with combined filter.`);

        const emails = [];
        for await (const msg of client.fetch(messageIds, { envelope: true, source: true })) {
          const body = msg.source?.toString("utf8") ?? "";
          logger.debug(
            `Fetched uid=${msg.uid} subject="${msg.envelope.subject}" date=${String(msg.envelope.date)}`,
          );
          emails.push({
            uid: msg.uid,
            subject: msg.envelope.subject,
            from: msg.envelope.from?.map((f) => `${f.name} <${f.mailbox}@${f.host}>`).join(", "),
            date: msg.envelope.date,
            body,
          });
        }

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
    await notifyDiscord(`❌ check-nubank-emails: Failed to open database — ${err.message}`);
    process.exit(1);
  }

  const cutoffDate = getLatestTransactionDate(db);

  let emails;
  try {
    emails = await fetchEmailsFromImap(cutoffDate);
  } catch (err) {
    logger.error(`IMAP failed after all retries: ${err.message}`);
    await notifyDiscord(`❌ check-nubank-emails: IMAP failed after all retries — ${err.message}`);
    db.close();
    process.exit(1);
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
      saved++;
    } catch (err) {
      logger.error(`Failed to insert uid=${email.uid}: ${err.message}`);
      await notifyDiscord(
        `❌ check-nubank-emails: Failed to insert uid=${email.uid} — ${err.message}`,
      );
      discarded++;
    }
  }

  db.close();

  logger.info(
    `=== Done. Found: ${emails.length} | Saved: ${saved} | Skipped: ${skipped} | Discarded: ${discarded} ===`,
  );
}

main().catch(async (err) => {
  logger.error(`Unexpected error: ${err.message}`);
  await notifyDiscord(`❌ check-nubank-emails: Unexpected error — ${err.message}`);
  process.exit(1);
});
