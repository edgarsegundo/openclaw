import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import { logger } from "./logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DB_PATH = path.join(__dirname, "visa-crawler.db");
export const SCHEMA_VERSAO = 1;

// ─── Campos críticos que disparam desempate quando divergem ──────────────────

export const CAMPOS_CRITICOS = ["custo", "entrevista", "validadeMinPassaporte", "seguroSaude"];

// ─── Setup ───────────────────────────────────────────────────────────────────

export function openDatabase() {
  logger.debug(`Opening database at: ${DB_PATH}`);
  const db = new Database(DB_PATH);

  db.exec(`
    CREATE TABLE IF NOT EXISTS paises (
      id          TEXT PRIMARY KEY,
      nome        TEXT NOT NULL,
      codigo_iso  TEXT NOT NULL,
      ativo       INTEGER NOT NULL DEFAULT 1,
      criado_em   DATETIME NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS visa_snapshots (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      pais_id         TEXT NOT NULL REFERENCES paises(id),
      coletado_em     DATE NOT NULL,
      schema_versao   INTEGER NOT NULL,
      status          TEXT NOT NULL DEFAULT 'atual' CHECK(status IN ('atual', 'divergente', 'arquivado')),

      -- campos críticos desnormalizados para comparação direta
      type_label              TEXT,
      custo                   TEXT,
      entrevista              INTEGER,
      validade_min_passaporte TEXT,
      seguro_saude            INTEGER,
      confiabilidade          TEXT,

      -- fonte da verdade
      json_completo   TEXT NOT NULL,

      criado_em       DATETIME NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS desempates (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id      INTEGER NOT NULL REFERENCES visa_snapshots(id),
      campo            TEXT NOT NULL,
      valor_anterior   TEXT,
      valor_novo       TEXT,
      valor_resolvido  TEXT,
      confianca        TEXT,
      resolvido_em     DATETIME NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS runs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      iniciado_em   DATETIME NOT NULL,
      finalizado_em DATETIME,
      status        TEXT NOT NULL CHECK(status IN ('running', 'success', 'partial', 'failed')),
      total         INTEGER,
      sucesso       INTEGER,
      divergencias  INTEGER,
      erros         INTEGER
    );
  `);

  logger.debug("Database opened and schema ensured.");
  return db;
}

// ─── Países ──────────────────────────────────────────────────────────────────

export function upsertPais(db, { id, nome, codigo_iso }) {
  db.prepare(`
    INSERT INTO paises (id, nome, codigo_iso)
    VALUES (@id, @nome, @codigo_iso)
    ON CONFLICT(id) DO UPDATE SET nome = excluded.nome, codigo_iso = excluded.codigo_iso
  `).run({ id, nome, codigo_iso });
}

export function getPaisesAtivos(db) {
  return db.prepare(`SELECT * FROM paises WHERE ativo = 1 ORDER BY nome`).all();
}

export function setPaisAtivo(db, id, ativo) {
  db.prepare(`UPDATE paises SET ativo = ? WHERE id = ?`).run(ativo ? 1 : 0, id);
}

// ─── Snapshots ───────────────────────────────────────────────────────────────

export function getUltimoSnapshot(db, paisId) {
  return db
    .prepare(`
    SELECT * FROM visa_snapshots
    WHERE pais_id = ? AND status = 'atual'
    ORDER BY coletado_em DESC
    LIMIT 1
  `)
    .get(paisId);
}

export function arquivarSnapshotsAnteriores(db, paisId) {
  db.prepare(`
    UPDATE visa_snapshots
    SET status = 'arquivado'
    WHERE pais_id = ? AND status = 'atual'
  `).run(paisId);
}

export function insertSnapshot(db, { paisId, data, status = "atual" }) {
  const result = db
    .prepare(`
    INSERT INTO visa_snapshots (
      pais_id, coletado_em, schema_versao, status,
      type_label, custo, entrevista, validade_min_passaporte, seguro_saude, confiabilidade,
      json_completo
    ) VALUES (
      @pais_id, @coletado_em, @schema_versao, @status,
      @type_label, @custo, @entrevista, @validade_min_passaporte, @seguro_saude, @confiabilidade,
      @json_completo
    )
  `)
    .run({
      pais_id: paisId,
      coletado_em: new Date().toISOString().split("T")[0],
      schema_versao: SCHEMA_VERSAO,
      status,
      type_label: data.typeLabel ?? null,
      custo: data.custo ?? null,
      entrevista: data.entrevista === null ? null : data.entrevista ? 1 : 0,
      validade_min_passaporte: data.validadeMinPassaporte ?? null,
      seguro_saude: data.seguroSaude === null ? null : data.seguroSaude ? 1 : 0,
      confiabilidade: data.confiabilidade ?? null,
      json_completo: JSON.stringify(data),
    });
  return result.lastInsertRowid;
}

export function marcarSnapshotDivergente(db, snapshotId) {
  db.prepare(`UPDATE visa_snapshots SET status = 'divergente' WHERE id = ?`).run(snapshotId);
}

// ─── Desempates ───────────────────────────────────────────────────────────────

export function insertDesempate(
  db,
  { snapshotId, campo, valorAnterior, valorNovo, valorResolvido, confianca },
) {
  db.prepare(`
    INSERT INTO desempates (snapshot_id, campo, valor_anterior, valor_novo, valor_resolvido, confianca)
    VALUES (@snapshot_id, @campo, @valor_anterior, @valor_novo, @valor_resolvido, @confianca)
  `).run({
    snapshot_id: snapshotId,
    campo,
    valor_anterior:
      valorAnterior !== null && valorAnterior !== undefined ? String(valorAnterior) : null,
    valor_novo: valorNovo !== null && valorNovo !== undefined ? String(valorNovo) : null,
    valor_resolvido:
      valorResolvido !== null && valorResolvido !== undefined ? String(valorResolvido) : null,
    confianca: confianca ?? null,
  });
}

// ─── Runs ────────────────────────────────────────────────────────────────────

export function insertRun(db) {
  const result = db
    .prepare(`
    INSERT INTO runs (iniciado_em, status)
    VALUES (datetime('now', 'localtime'), 'running')
  `)
    .run();
  return result.lastInsertRowid;
}

export function finishRun(db, runId, status, { total, sucesso, divergencias, erros }) {
  db.prepare(`
    UPDATE runs
    SET finalizado_em = datetime('now', 'localtime'), status = ?, total = ?, sucesso = ?, divergencias = ?, erros = ?
    WHERE id = ?
  `).run(status, total, sucesso, divergencias, erros, runId);
}
