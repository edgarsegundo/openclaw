import WebSocket from "ws";

/**
 * Task: eth-monitor
 *
 * Entry point for your task. Receives a `context` object with everything needed:
 * inputs, env vars, AI prompt runner, and artifact saving.
 *
 * ─── context properties ────────────────────────────────────────────────────
 *   taskName     — string, name of this task
 *   mode         — "manual" | "cron"
 *   executionId  — unique UUID for this run (useful for dynamic artifact names)
 *   inputs       — values declared in task.config.yaml inputs[]
 *                  e.g. context.inputs.topic
 *   env          — env vars declared in task.config.yaml env_vars{}
 *                  e.g. context.env.MY_API_KEY
 *   runPrompt    — async fn — only available when --template was selected (see below)
 *   saveArtifact — fn(name, data) — writes JSON to artifacts/eth-monitor/<name>.json
 */
export default async function (context) {
  const { taskName, mode, executionId, runPrompt, saveArtifact } = context;

  console.log(`Task: ${taskName} | Mode: ${mode} | ID: ${executionId}`);

  if (runPrompt) {
    // ── runPrompt(extraVars?) ─────────────────────────────────────────────
    // Renders the prompt template, calls the AI, validates against schema.js,
    // and returns a result object. The template is selected via --template or
    // interactively at runtime.
    //
    // Task inputs (e.g. inputs.topic) are auto-injected as {{topic}} in user.md.
    // Pass extraVars to add/override variables not declared in task inputs:
    //
    //   const result = await runPrompt({ date_today: new Date().toISOString().slice(0, 10) });
    //
    // ── result fields ────────────────────────────────────────────────────────
    //
    //   result.artifact
    //     The validated JSON object defined by schema.js.
    //     Shape depends on your schema — this is the main AI output.
    //
    //   result.citations        (Perplexity/sonar only — [] for OpenAI)
    //     string[] of source URLs the model consulted.
    //     Index is 0-based here; citation markers in the text are 1-based:
    //       [1] in text → citations[0]
    //       [2] in text → citations[1]
    //
    //   result.searchResults    (Perplexity/sonar only — [] for OpenAI)
    //     Rich metadata for each source, aligned 1:1 with citations[].
    //     Each entry: { title, url, snippet, date, last_updated, source }
    //     Use this when you want to show source cards (title + snippet)
    //     instead of bare URLs.
    //
    //   result.usage            (Perplexity/sonar only — basic tokens for OpenAI)
    //     Token counts + cost breakdown.
    //     Key fields:
    //       usage.prompt_tokens      — input tokens consumed
    //       usage.completion_tokens  — output tokens generated
    //       usage.cost.total_cost    — total cost in USD (Perplexity only)
    //       usage.cost.search_queries_cost — cost of web searches (Perplexity only)
    //
    //   result.model    — model string used (e.g. "sonar-pro", "gpt-4o")
    //   result.template — template name used for this call
    //
    // ── Usage examples ───────────────────────────────────────────────────────
    //
    // Basic — just the schema output:
    //   const { artifact } = await runPrompt();
    //   console.log(artifact.title);
    //
    // With Perplexity source metadata:
    //   const { artifact, citations, searchResults, usage } = await runPrompt();
    //   console.log(citations[0]);                    // first source URL
    //   console.log(searchResults[0].title);          // first source title
    //   console.log(searchResults[0].snippet);        // first source excerpt
    //   console.log(usage?.cost?.total_cost);         // cost in USD
    //
    // With extra variables passed at call time:
    //   const { artifact } = await runPrompt({ date_today: new Date().toISOString().slice(0, 10) });

    const { artifact, citations, searchResults, usage } = await runPrompt();

    // ── Manipulate before saving (optional) ──────────────────────────────
    // You have full control — transform, enrich, filter before persisting.
    //
    // Add runtime metadata:
    //   const enriched = { ...artifact, generated_at: new Date().toISOString() };
    //   await saveArtifact("result", enriched);
    //
    // Dynamic filename from artifact field:
    //   const slug = artifact.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
    //   await saveArtifact(`article-${slug}`, artifact);
    //
    // Save multiple artifacts from one run:
    //   await saveArtifact("summary", { title: artifact.title, tags: artifact.tags });
    //   await saveArtifact("full", artifact);
    //
    // Save source metadata alongside the artifact (useful for Perplexity tasks):
    //   await saveArtifact("result", artifact);
    //   if (searchResults.length) await saveArtifact("sources", searchResults);
    //
    // Skip saving — just send to an external API:
    //   await sendToExternalApi(artifact);

    // Default: save as declared in task.config.yaml artifacts[]
    await saveArtifact("result", artifact);

    if (usage?.cost?.total_cost != null) {
      console.log(`Cost: $${usage.cost.total_cost.toFixed(6)} USD`);
    }

    console.log("Done!");
  }





  const url =
    "wss://stream.binance.com:9443/stream?streams=ethbrl@bookTicker/ethbrl@kline_1h";

  const ws = new WebSocket(url);

  let lastLineLength = 0;

  function updateLine(text) {
    const padding = " ".repeat(Math.max(0, lastLineLength - text.length));
    process.stdout.write("\r" + text + padding);
    lastLineLength = text.length;
  }  

  ws.on("open", () => {
    console.log("🟢 Conectado (multi-stream)");
  });


  // 🔥 Quando usar cada um
  // ✅ Use @trade se você quer:
  // Ver movimento real do mercado
  // Detectar:
  // volume forte
  // agressão (compras/vendas rápidas)
  // Criar:
  // candles personalizados (5s, 10s)
  // análise de fluxo (order flow)

  // 👉 É mais “cru” e mais detalhado

  // ✅ Use @bookTicker se você quer:
  // Saber por quanto você pode comprar/vender agora
  // Tomar decisão de entrada/saída
  // Criar bots simples e rápidos

  // 👉 É o mais usado porque:

  // é mais leve
  // mais direto
  // menos ruído

  ws.on("message", (event) => {
    const msg = JSON.parse(event.toString());
    const { stream, data } = msg;

    // 🔹 Preço em tempo real (linha fixa)
    if (stream.includes("bookTicker")) {
      const bid = Number(data.b).toFixed(2);
      const ask = Number(data.a).toFixed(2);

      updateLine(`💰 ETH/BRL | BID: ${bid} | ASK: ${ask}`);
    }

    // 🔹 Candle fechado (log abaixo)
    if (stream.includes("kline")) {
      const k = data.k;

      if (k.x) {
        process.stdout.write("\n"); // quebra linha sem bugar o layout
        console.log("📊 Candle fechado:", {
          open: k.o,
          high: k.h,
          low: k.l,
          close: k.c,
          volume: k.v
        });
      }
    }    

  });

  ws.on("close", () => {
    console.log("🔴 Desconectado");
  });

  ws.on("error", (err) => {
    console.error("Erro:", err.message);
  });




}
