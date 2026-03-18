import "dotenv/config";
import { processarPais } from "./crawler.js";
import { openDatabase, getPaisesAtivos, insertRun, finishRun } from "./db.js";
import { notifyDiscord } from "./discord.js";
import { logger } from "./logger.js";

// ─── Config ───────────────────────────────────────────────────────────────────

const RATE_LIMIT_MS = parseInt(process.env.RATE_LIMIT_MS ?? "2000", 10);

// ISOs passados como argumento: node index.js PT ou node index.js PT,US,AU
const ARG_ISOS = process.argv[2]
  ? process.argv[2]
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
  : null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Runner ───────────────────────────────────────────────────────────────────

async function rodarCrawler(db) {
  let paises = getPaisesAtivos(db);

  if (!paises.length) {
    logger.warn("Nenhum país ativo no banco. Use: node countries.js add <ISO[,ISO,...]>");
    return;
  }

  // filtrar por ISO se passado como argumento
  if (ARG_ISOS) {
    const naoEncontrados = ARG_ISOS.filter((iso) => !paises.some((p) => p.codigo_iso === iso));
    if (naoEncontrados.length) {
      logger.warn(`ISO(s) não encontrado(s) ou inativo(s): ${naoEncontrados.join(", ")}`);
    }
    paises = paises.filter((p) => ARG_ISOS.includes(p.codigo_iso));
    if (!paises.length) {
      logger.error("Nenhum país válido para processar com os ISOs informados.");
      return;
    }
  }

  const isos = paises.map((p) => p.codigo_iso).join(", ");

  logger.info(`=== visa-crawler iniciado — ${paises.length} país(es): ${isos} ===`);

  await notifyDiscord(
    `🚀 **visa-crawler iniciado**\n` +
      `🌍 **Países (${paises.length}):** ${isos}\n` +
      `📅 **Data:** ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
  );

  const runId = insertRun(db);

  let sucesso = 0;
  let divergencias = 0;
  let erros = 0;

  for (let i = 0; i < paises.length; i++) {
    const pais = paises[i];
    logger.info(`[${i + 1}/${paises.length}] Processando: ${pais.nome}`);

    try {
      const resultado = await processarPais(db, pais.id, pais.nome);
      sucesso++;
      divergencias += resultado.divergencias;
    } catch (err) {
      logger.error(`[${pais.nome}] Falha: ${err.message}`);
      erros++;
    }

    if (i < paises.length - 1) {
      logger.debug(`Rate limit: aguardando ${RATE_LIMIT_MS}ms...`);
      await sleep(RATE_LIMIT_MS);
    }
  }

  const status = erros === paises.length ? "failed" : erros > 0 ? "partial" : "success";
  finishRun(db, runId, status, { total: paises.length, sucesso, divergencias, erros });

  const resumo =
    `✅ **visa-crawler finalizado**\n` +
    `🌍 **Total:** ${paises.length}\n` +
    `✔️ **Sucesso:** ${sucesso}\n` +
    `⚖️ **Divergências:** ${divergencias}\n` +
    `❌ **Erros:** ${erros}\n` +
    `📊 **Status:** ${status}`;

  const resumoIsos = paises.map((p) => p.codigo_iso).join(", ");
  logger.info(
    `=== Finalizado — [${resumoIsos}] | Total: ${paises.length} | Sucesso: ${sucesso} | Divergências: ${divergencias} | Erros: ${erros} ===`,
  );
  await notifyDiscord(resumo);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  let db;
  try {
    db = openDatabase();
  } catch (err) {
    logger.error(`Falha ao abrir banco: ${err.message}`);
    await notifyDiscord(`❌ **visa-crawler: falha ao abrir banco**\n⚠️ ${err.message}`);
    process.exit(1);
  }

  try {
    await rodarCrawler(db);
  } catch (err) {
    logger.error(`Erro inesperado: ${err.message}`);
    await notifyDiscord(`❌ **visa-crawler: erro inesperado**\n⚠️ ${err.message}`);
  } finally {
    db.close();
  }
}

void main();
