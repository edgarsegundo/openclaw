import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "notificacoes_seguros.db");

console.log("📦 Usando DB em:", dbPath);

const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS notificacoes_seguros (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    sobrenome TEXT,
    telefone TEXT NOT NULL,
    data_viagem DATE NOT NULL,
    data_nascimento DATE,
    idade INTEGER,
    data_notificacao DATETIME,
    UNIQUE(telefone, data_viagem)
  );
`);

const clientesPath = path.join(__dirname, "clientes.json");
const clientes = JSON.parse(fs.readFileSync(clientesPath, "utf8"));

console.log(`📋 ${clientes.length} cliente(s) encontrado(s) no arquivo.`);

function calcularIdade(dataNascimento) {
  const hoje = new Date();
  const nascimento = new Date(dataNascimento);

  let idade = hoje.getFullYear() - nascimento.getFullYear();

  const mes = hoje.getMonth() - nascimento.getMonth();

  if (mes < 0 || (mes === 0 && hoje.getDate() < nascimento.getDate())) {
    idade--;
  }

  return idade;
}

// 🔧 Normaliza telefone (remove tudo que não for número)
function normalizarTelefone(tel) {
  if (!tel) return null;

  return tel
    .toString()
    .replace(/\D/g, "")        // remove tudo que não é número
    .replace(/^55/, "");       // remove DDI Brasil se vier
}

const stmt = db.prepare(`
  INSERT OR IGNORE INTO notificacoes_seguros 
  (nome, sobrenome, telefone, data_viagem, data_nascimento, idade)
  VALUES (?, ?, ?, ?, ?, ?)
`);

let inseridos = 0;
let ignorados = 0;
let invalidos = 0;

for (const c of clientes) {
  const nome = c.primeiro_nome || "(sem nome)";
  const sobrenome = c.sobrenome || "";
  const telefone = normalizarTelefone(c.celular);
  const data_viagem = c.data_viagem;
  const data_nascimento = c.data_nascimento;

  if (!nome || !telefone || !data_viagem || !data_nascimento) {
    invalidos++;
    console.log("  [!] Registro inválido:", c);
    continue;
  }

  const idade = calcularIdade(data_nascimento);

  const result = stmt.run(
    nome,
    sobrenome,
    telefone,
    data_viagem,
    data_nascimento,
    idade
  );

  if (result.changes > 0) {
    inseridos++;
    console.log(
      `  [+] ${nome} — ${telefone} — ${data_viagem} — ${idade} anos`
    );
  } else {
    ignorados++;
    console.log(
      `  [=] Já existe: ${nome} — ${telefone} — ${data_viagem}`
    );
  }
}

console.log(`\n✅ Importação concluída.`);
console.log(`   Inseridos : ${inseridos}`);
console.log(`   Ignorados : ${ignorados}`);
console.log(`   Inválidos : ${invalidos}`);
console.log(`   Total     : ${clientes.length}`);

db.close();
