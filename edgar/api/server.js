require("dotenv").config();
// Simple Express API to serve transactions from SQLite
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());

// Importa e usa o router do projeto fastvistos
// Não está mais ativo, mas deixo comentado para facilitar reativação futura se necessário
// const fastvistosRouter = require("./fastvistos.routes");
// app.use("/api/fastvistos", fastvistosRouter);

// Importa e usa o router do visa-crawler
const visaCrawlerRouter = require("./visa-crawler.routes");
app.use("/api", visaCrawlerRouter);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
