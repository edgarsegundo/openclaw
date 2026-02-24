const express = require("express");
const Database = require("better-sqlite3");
const path = require("path");

const router = express.Router();

const DB_PATH = path.resolve(__dirname, "../automations/check-nubank-emails/db.fastvistos");
const db = new Database(DB_PATH, { readonly: true });

// GET /api/fastvistos/transactions
router.get("/transactions", (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 10;
  const offset = (page - 1) * pageSize;

  const columns = [
    "id",
    "imap_uid",
    "cnpj",
    "operation",
    "name",
    "type",
    "person_name",
    "amount",
    "transaction_date",
    "created_at",
  ];
  const total = db.prepare(`SELECT COUNT(*) as count FROM transactions`).get().count;
  const rows = db
    .prepare(
      `SELECT ${columns.join(", ")} FROM transactions ORDER BY transaction_date DESC LIMIT ? OFFSET ?`,
    )
    .all(pageSize, offset);
  res.json({ total, page, pageSize, rows });
});

module.exports = router;
