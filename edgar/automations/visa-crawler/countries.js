import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { openDatabase, upsertPais, getPaisesAtivos, setPaisAtivo } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, "countries-data.json");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function carregarDados() {
  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  return JSON.parse(raw);
}

function buscarPais(iso, dados) {
  return dados.find((p) => p.iso.toUpperCase() === iso.toUpperCase());
}

function slugify(iso) {
  return iso.toLowerCase();
}

function printTabela(paises) {
  if (!paises.length) {
    console.log("Nenhum país ativo.");
    return;
  }
  console.log("\n  ISO   Nome");
  console.log("  ───   ────");
  for (const p of paises) {
    console.log(`  ${p.codigo_iso.padEnd(5)} ${p.nome}`);
  }
  console.log(`\n  Total: ${paises.length} país(es)\n`);
}

function printAjuda() {
  console.log(`
  Uso: node countries.js <comando> [argumentos]

  Comandos:
    add <ISO[,ISO,...]>    Adiciona um ou mais países pelo código ISO
    remove <ISO>           Desativa um país (mantém histórico)
    list                   Lista países ativos no banco

  Exemplos:
    node countries.js add JP
    node countries.js add JP,US,AU,FR,DE
    node countries.js remove JP
    node countries.js list
  `);
}

// ─── Comandos ────────────────────────────────────────────────────────────────

function cmdAdd(db, isoArg) {
  const dados = carregarDados();
  const isos = isoArg
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  let adicionados = 0;
  let naoEncontrados = 0;

  for (const iso of isos) {
    const pais = buscarPais(iso, dados);
    if (!pais) {
      console.error(`  ✗ "${iso}" não encontrado em countries-data.json`);
      naoEncontrados++;
      continue;
    }

    upsertPais(db, {
      id: slugify(iso),
      nome: pais.nome,
      codigo_iso: pais.iso,
    });

    // garantir que está ativo caso tenha sido desativado antes
    setPaisAtivo(db, slugify(iso), true);

    console.log(`  ✓ ${pais.nome} (${pais.iso}) adicionado`);
    adicionados++;
  }

  console.log(
    `\n  ${adicionados} adicionado(s)${naoEncontrados ? `, ${naoEncontrados} não encontrado(s)` : ""}\n`,
  );
}

function cmdRemove(db, isoArg) {
  const iso = isoArg.trim().toUpperCase();
  const id = slugify(iso);

  const paises = getPaisesAtivos(db);
  const existe = paises.find((p) => p.codigo_iso === iso);

  if (!existe) {
    console.error(`  ✗ "${iso}" não está ativo no banco.\n`);
    process.exit(1);
  }

  setPaisAtivo(db, id, false);
  console.log(`  ✓ ${existe.nome} (${iso}) desativado. Histórico preservado.\n`);
}

function cmdList(db) {
  const paises = getPaisesAtivos(db);
  printTabela(paises);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const [, , comando, argumento] = process.argv;

if (!comando) {
  printAjuda();
  process.exit(0);
}

const db = openDatabase();

switch (comando) {
  case "add":
    if (!argumento) {
      console.error("  Uso: node countries.js add <ISO[,ISO,...]>\n");
      process.exit(1);
    }
    cmdAdd(db, argumento);
    break;

  case "remove":
    if (!argumento) {
      console.error("  Uso: node countries.js remove <ISO>\n");
      process.exit(1);
    }
    cmdRemove(db, argumento);
    break;

  case "list":
    cmdList(db);
    break;

  default:
    console.error(`  Comando desconhecido: "${comando}"\n`);
    printAjuda();
    process.exit(1);
}

db.close();
