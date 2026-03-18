require("dotenv").config({ path: ".env" });

const cors = require("cors");
const express = require("express");
const Database = require("better-sqlite3");
const path = require("path");
const axios = require("axios");
const router = express.Router();

// --- INÍCIO: Endpoints de vistos ---
const visaDbPath = path.resolve(__dirname, "../automations/visa-crawler/visa-crawler.db");
const visaDb = new Database(visaDbPath, { readonly: true });

// GET /api/visa-countries
router.get("/visa-countries", (req, res) => {
  try {
    // Corrigido: tabela 'paises' com colunas: id (slug), nome, codigo_iso, ativo (1/0)
    const rows = visaDb
      .prepare(
        "SELECT id, nome, codigo_iso FROM paises WHERE ativo = 1 ORDER BY nome COLLATE NOCASE",
      )
      .all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Erro ao consultar países", details: err.message });
  }
});

// GET /api/visa/:slug
router.get("/visa/:slug", (req, res) => {
  const slug = req.params.slug;
  try {
    // Espera-se uma tabela 'visa_snapshots' com as colunas do exemplo
    // Busca o snapshot mais recente para o país
    const row = visaDb
      .prepare(
        `SELECT id, pais_id, coletado_em, schema_versao, status, type_label, custo, entrevista, validade_min_passaporte, seguro_saude, confiabilidade, json_completo
       FROM visa_snapshots WHERE pais_id = ? ORDER BY coletado_em DESC LIMIT 1`,
      )
      .get(slug);
    if (!row) {
      return res.status(404).json({ error: "País não encontrado ou sem dados de visto." });
    }
    // json_completo está como string, precisa ser objeto
    let jsonCompleto = null;
    try {
      jsonCompleto =
        typeof row.json_completo === "string" ? JSON.parse(row.json_completo) : row.json_completo;
    } catch {
      jsonCompleto = null;
    }
    res.json({
      id: row.id,
      pais_id: row.pais_id,
      coletado_em: row.coletado_em,
      schema_versao: row.schema_versao,
      status: row.status,
      type_label: row.type_label,
      custo: row.custo,
      entrevista: row.entrevista,
      validade_min_passaporte: row.validade_min_passaporte,
      seguro_saude: row.seguro_saude,
      confiabilidade: row.confiabilidade,
      json_completo: jsonCompleto,
    });
  } catch (err) {
    res.status(500).json({ error: "Erro ao consultar visto", details: err.message });
  }
});
// --- FIM: Endpoints de vistos ---

const businessId = process.env.FASTVISTOS_BUSINESS_ID;
const apiBaseUrl = process.env.FASTVISTOS_API_URL || "http://localhost:8000/api";

const DB_PATH = path.resolve(__dirname, "../automations/check-nubank-emails/db.fastvistos");
const db = new Database(DB_PATH, { readonly: false });

// GET /api/fastvistos/transactions
router.get("/transactions", (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 10;
  const offset = (page - 1) * pageSize;
  const status = req.query.status?.toUpperCase();

  const VALID_STATUSES = ["RECONCILED", "UNRECONCILED"];
  const statusFilter = status && VALID_STATUSES.includes(status) ? status : null;

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
    "description",
    "status",
  ];

  const where = statusFilter ? `WHERE status = ?` : "";
  const params = statusFilter ? [status] : [];

  const total = db
    .prepare(`SELECT COUNT(*) as count FROM transactions ${where}`)
    .get(...params).count;

  const rows = db
    .prepare(
      `SELECT ${columns.join(", ")} FROM transactions ${where}
       ORDER BY transaction_date DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, offset);

  res.json({ total, page, pageSize, rows });
});

// PATCH /api/fastvistos/transactions/:id/description
router.patch("/transactions/:id/description", express.json(), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { description } = req.body;

  if (!id || typeof description !== "string") {
    return res.status(400).json({ error: "Invalid id or description" });
  }

  try {
    const stmt = db.prepare("UPDATE transactions SET description = ? WHERE id = ?");
    const result = stmt.run(description, id);

    if (result.changes === 0) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Database error", details: err.message });
  }
});

router.patch("/transactions/:id/status", express.json(), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { status } = req.body;

  if (!id || typeof status !== "string" || !status.trim()) {
    return res.status(400).json({ error: "Invalid id or status" });
  }

  try {
    const stmt = db.prepare("UPDATE transactions SET status = ? WHERE id = ?");
    const result = stmt.run(status, id);

    if (result.changes === 0) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Database error", details: err.message });
  }
});

// Proxy endpoint: GET /api/fastvistos/microservicesadm/proxy/customer-orders/search
// Proxy endpoint: GET /api/fastvistos/microservicesadm/proxy/customer-orders/search
// Only allow requests from a specific origin (CORS)

const allowedOrigins = new Set([
  "http://127.0.0.1:18789",
  "http://localhost:18789",
  "http://localhost:5173",
  "http://localhost:5174",
]);

router.get(
  "/microservicesadm/proxy/customer-orders/search",
  cors({
    origin: function (origin, callback) {
      console.log("***** CORS check for origin:", origin);
      if (!origin || allowedOrigins.has(origin)) {
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
      const response = await axios.get(`${apiBaseUrl}/customer-orders/search/`, {
        params,
        headers: {
          "X-API-Key": apiKey,
        },
        maxBodyLength: Infinity,
      });
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

// Proxy endpoint: POST /api/fastvistos/microservicesadm/proxy/customer-order-transaction/delete
router.post(
  "/microservicesadm/proxy/customer-order-transaction/delete",
  cors({
    origin: function (origin, callback) {
      console.log("***** CORS check for origin:", origin);
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }),
  express.json(),
  async (req, res) => {
    try {
      const { customer_order_transaction_uuid, transaction_id } = req.body;
      if (!customer_order_transaction_uuid || !transaction_id) {
        return res.status(400).json({
          detail: "customer_order_transaction_uuid e transaction_id são obrigatórios.",
        });
      }
      const apiKey = process.env.API_KEY_MICROSEVICESADM;
      const response = await axios.post(
        `${apiBaseUrl}/customer-order-transaction/delete/`,
        { customer_order_transaction_uuid },
        {
          headers: {
            "X-API-Key": apiKey,
          },
          maxBodyLength: Infinity,
        },
      );

      // Se a exclusão falhou, retorna erro sem atualizar o banco
      if (response.status != 200) {
        return res
          .status(500)
          .json({ error: "Failed to delete customer order transaction in FastVistos." });
      }

      // Atualiza campo customer_order_transaction_uuid para NULL
      try {
        db.prepare(
          "UPDATE transactions SET customer_order_transaction_uuid = NULL WHERE id = ?",
        ).run(transaction_id);
      } catch (dbErr) {
        // Log, mas não bloqueia resposta
        console.error("Erro ao atualizar customer_order_transaction_uuid para NULL:", dbErr);
      }
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

// Proxy endpoint: POST /api/fastvistos/microservicesadm/proxy/customer-order-transaction/create
router.post(
  "/microservicesadm/proxy/customer-order-transaction/create",
  cors({
    origin: function (origin, callback) {
      console.log("***** CORS check for origin:", origin);
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }),
  express.json(),
  async (req, res) => {
    try {
      const { customer_order_uuid, transaction_id } = req.body;
      if (!customer_order_uuid || !transaction_id) {
        return res.status(400).json({
          detail: "customer_order_uuid e transaction_id são obrigatórios.",
        });
      }
      const apiKey = process.env.API_KEY_MICROSEVICESADM;
      const response = await axios.post(
        `${apiBaseUrl}/customer-order-transaction/create/`,
        { customer_order_uuid },
        {
          headers: {
            "X-API-Key": apiKey,
          },
          maxBodyLength: Infinity,
        },
      );
      const customer_order_transaction_uuid = response.data?.id || null;

      if (!customer_order_transaction_uuid) {
        return res
          .status(500)
          .json({ error: "Failed to create customer order transaction, missing id in response." });
      }

      try {
        db.prepare("UPDATE transactions SET customer_order_transaction_uuid = ? WHERE id = ?").run(
          customer_order_transaction_uuid,
          transaction_id,
        );
      } catch (dbErr) {
        // Log, mas não bloqueia resposta
        console.error("Erro ao atualizar customer_order_transaction_uuid:", dbErr);
      }
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

// Proxy endpoint: POST /api/fastvistos/microservicesadm/proxy/customer-order-full/create
router.post(
  "/microservicesadm/proxy/customer-order-full/create",
  cors({
    origin: function (origin, callback) {
      console.log(">>>> CORS check for origin:", origin);
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }),
  express.json(),
  async (req, res) => {
    try {
      const { customer_id, customer_name, external_transaction_id } = req.body;
      if (!customer_id && !customer_name) {
        return res.status(400).json({ detail: "customer_id ou customer_name é obrigatório." });
      }
      if (!external_transaction_id) {
        return res.status(400).json({ detail: "external_transaction_id é obrigatório." });
      }
      if (!businessId) {
        return res.status(400).json({ detail: "business_id é obrigatório." });
      }
      const apiKey = process.env.API_KEY_MICROSEVICESADM;
      const payload = {
        customer_id,
        customer_name,
        external_transaction_id,
        business_id: businessId,
      };
      const response = await axios.post(`${apiBaseUrl}/customer-order-full/create/`, payload, {
        headers: {
          "X-API-Key": apiKey,
        },
        maxBodyLength: Infinity,
      });
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
