// Simple Express API to serve transactions from SQLite
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());

// Importa e usa o router do projeto fastvistos
const fastvistosRouter = require("./fastvistos.routes");
app.use("/api/fastvistos", fastvistosRouter);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
