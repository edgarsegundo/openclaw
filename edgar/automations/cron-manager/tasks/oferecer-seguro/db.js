import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "notificacoes_seguros.db");

export function openDb() {
  const db = new Database(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS notificacoes_seguros (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      telefone TEXT NOT NULL,
      data_viagem DATE NOT NULL,
      data_notificacao DATETIME,
      UNIQUE(telefone, data_viagem)
    );
  `);
  return db;
}
