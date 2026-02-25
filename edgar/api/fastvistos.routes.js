require("dotenv").config({ path: ".env" });

const cors = require("cors");
const express = require("express");
const Database = require("better-sqlite3");
const path = require("path");
const axios = require("axios");
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

// Proxy endpoint: GET /api/fastvistos/microservicesadm/proxy/customer-orders/search
// Proxy endpoint: GET /api/fastvistos/microservicesadm/proxy/customer-orders/search
// Only allow requests from a specific origin (CORS)
const allowedOrigin = "http://127.0.0.1:18789";

router.get(
  "/microservicesadm/proxy/customer-orders/search",
  cors({
    origin: function (origin, callback) {
      // Permite SOMENTE chamadas do domínio autorizado (não permite curl/server-to-server)
      if (origin === allowedOrigin) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }),
  async (req, res) => {
    try {
      const params = req.query;
      const apiKey = process.env.API_KEY_MICROSEVICESADM;

      const response = await axios.get(
        "https://sys.fastvistos.com.br/api/customer-orders/search/",
        {
          params,
          headers: {
            "X-API-Key": apiKey,
          },
          maxBodyLength: Infinity,
        },
      );

      res.status(response.status).json(response.data);
    } catch (error) {
      if (error.response) {
        res.status(error.response.status).json(error.response.data);
      } else {
        res.status(500).json({ error: "Proxy error", details: error.message });
      }
    }
  },
);

module.exports = router;
