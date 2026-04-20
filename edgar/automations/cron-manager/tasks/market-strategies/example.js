const axios = require("axios");
const { RSI } = require("technicalindicators");

// ================= CONFIG =================
const TICKERS = [
  "VALE3.SA",
  "PETR4.SA",
  "WEGE3.SA",
  "SUZB3.SA",
  "ITUB4.SA",
  "BBDC4.SA",
  "BBAS3.SA",
  "ABEV3.SA",
];

const CACHE = new Map();
const CACHE_TTL = 1000 * 60 * 5; // 5 minutos

// ================= UTIL =================
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ================= FETCH COM RETRY =================
async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await axios.get(url, {
        timeout: 5000,
        headers: {
          "User-Agent": "Mozilla/5.0",
        },
      });
      return res.data;
    } catch (err) {
      if (i === retries - 1) throw err;
      await sleep(1000 * (i + 1));
    }
  }
}

// ================= DADOS HISTÓRICOS =================
async function getHistoricalData(ticker) {
  const now = Date.now();

  if (CACHE.has(ticker)) {
    const { timestamp, data } = CACHE.get(ticker);
    if (now - timestamp < CACHE_TTL) {
      return data;
    }
  }

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=2mo&interval=1d`;

  const raw = await fetchWithRetry(url);

  if (
    !raw ||
    !raw.chart ||
    !raw.chart.result ||
    !raw.chart.result[0]
  ) {
    return null;
  }

  const result = raw.chart.result[0];
  const quote = result.indicators.quote[0];

  const closes = quote.close.filter(v => v !== null);
  const volumes = quote.volume.filter(v => v !== null);

  const data = { closes, volumes };

  CACHE.set(ticker, {
    timestamp: now,
    data,
  });

  return data;
}

// ================= ANALISE AVANÇADA =================
function analyzeStock({ closes, volumes }) {
  if (closes.length < 30) return null;

  const last = closes.at(-1);
  const d1 = closes.at(-2);
  const d3 = closes.at(-4);
  const d5 = closes.at(-6);

  // QUEDAS
  const drop1d = ((last - d1) / d1) * 100;
  const drop3d = ((last - d3) / d3) * 100;
  const drop5d = ((last - d5) / d5) * 100;

  // RSI
  const rsiArr = RSI.calculate({
    values: closes,
    period: 14,
  });
  const rsi = rsiArr.at(-1);

  // MÉDIA
  const sma20 =
    closes.slice(-20).reduce((a, b) => a + b, 0) / 20;

  const distanceFromSMA = ((last - sma20) / sma20) * 100;

  // VOLUME
  const avgVolume =
    volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;

  const lastVolume = volumes.at(-1);

  const volumeSpike = lastVolume > avgVolume * 2;

  // ACELERAÇÃO
  const acceleratingDrop = drop1d < drop3d / 3;

  // REVERSÃO INICIAL
  const last2 = closes.at(-2);
  const last3 = closes.at(-3);

  const possibleReversal =
    last > last2 && last2 <= last3;

  // SCORE
  let score = 0;

  if (drop5d < -7) score += 2;
  if (drop3d < -5) score += 2;
  if (drop1d < -2) score += 1;

  if (rsi < 30) score += 2;
  if (distanceFromSMA < -5) score += 2;
  if (volumeSpike) score += 3;
  if (acceleratingDrop) score += 2;
  if (possibleReversal) score += 2;

  return {
    price: last,
    drop1d,
    drop3d,
    drop5d,
    rsi,
    distanceFromSMA,
    volumeSpike,
    acceleratingDrop,
    possibleReversal,
    score,
  };
}

// ================= SCANNER =================
async function runScanner() {
  const results = [];

  for (let ticker of TICKERS) {
    try {
      const data = await getHistoricalData(ticker);
      if (!data) continue;

      const analysis = analyzeStock(data);
      if (!analysis) continue;

      // FILTRO FINAL
      if (
        analysis.score >= 7 &&
        analysis.drop5d < -7 &&
        analysis.rsi < 35
      ) {
        results.push({
          ticker,
          price: analysis.price.toFixed(2),
          drop5d: analysis.drop5d.toFixed(2) + "%",
          rsi: analysis.rsi.toFixed(2),
          score: analysis.score,
          reversal: analysis.possibleReversal ? "YES" : "NO",
        });
      }
    } catch (err) {
      console.error(`Erro em ${ticker}:`, err.message);
    }
  }

  // ORDENA (maior score primeiro)
  results.sort((a, b) => b.score - a.score);

  console.log("\n📉 AÇÕES SANGRANDO (TOP OPORTUNIDADES):\n");
  console.table(results);
}

runScanner();
