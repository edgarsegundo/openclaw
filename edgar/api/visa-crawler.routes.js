const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");
const router = express.Router();

// --- INÍCIO: Endpoints de vistos ---
const visaDbPath = path.resolve(__dirname, "../automations/visa-crawler/visa-crawler.db");
const visaDb = new Database(visaDbPath, { readonly: true });

// GET /visa-countries
router.get("/visa-countries", (req, res) => {
  try {
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

// GET /visa/:slug
router.get("/visa/:slug", (req, res) => {
  const slug = req.params.slug;
  try {
    const row = visaDb
      .prepare(
        `SELECT id, pais_id, coletado_em, schema_versao, status, type_label, custo, entrevista, validade_min_passaporte, seguro_saude, confiabilidade, json_completo
       FROM visa_snapshots WHERE pais_id = ? ORDER BY coletado_em DESC LIMIT 1`,
      )
      .get(slug);
    if (!row) {
      return res.status(404).json({ error: "País não encontrado ou sem dados de visto." });
    }
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

// GET /visa-countries/timestamps
router.get("/visa-countries/timestamps", (req, res) => {
  try {
    const rows = visaDb
      .prepare(
        `SELECT pais_id AS id, MAX(coletado_em) AS atualizadoEm
       FROM visa_snapshots
       GROUP BY pais_id
       ORDER BY pais_id`,
      )
      .all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Erro ao consultar timestamps", details: err.message });
  }
});

// --- FIM: Endpoints de vistos ---

module.exports = router;
