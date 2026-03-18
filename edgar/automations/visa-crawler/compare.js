import { CAMPOS_CRITICOS, insertDesempate, marcarSnapshotDivergente } from "./db.js";
import { notifyDiscord } from "./discord.js";
import { logger } from "./logger.js";

const API_KEY = process.env.PERPLEXITY_API_KEY;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizar(valor) {
  if (valor === null || valor === undefined) {
    return null;
  }
  if (typeof valor === "boolean") {
    return String(valor);
  }
  // normaliza booleanos vindos do SQLite (0/1)
  if (valor === 0) {
    return "false";
  }
  if (valor === 1) {
    return "true";
  }
  return String(valor).trim().toLowerCase();
}

function campoSnapshotParaJson(campo) {
  const map = {
    custo: "custo",
    entrevista: "entrevista",
    validadeMinPassaporte: "validadeMinPassaporte",
    seguroSaude: "seguroSaude",
  };
  return map[campo] ?? campo;
}

// ─── Comparação ───────────────────────────────────────────────────────────────

export function detectarDivergencias(snapshotAnterior, dadosNovos) {
  if (!snapshotAnterior) {
    return [];
  }

  const anteriorJson = JSON.parse(snapshotAnterior.json_completo);
  const divergencias = [];

  for (const campo of CAMPOS_CRITICOS) {
    const campoJson = campoSnapshotParaJson(campo);
    const valorAnterior = normalizar(anteriorJson[campoJson]);
    const valorNovo = normalizar(dadosNovos[campoJson]);

    if (valorAnterior !== valorNovo) {
      logger.warn(`Divergência em "${campo}": anterior="${valorAnterior}" novo="${valorNovo}"`);
      divergencias.push({
        campo,
        valorAnterior: anteriorJson[campoJson],
        valorNovo: dadosNovos[campoJson],
      });
    }
  }

  return divergencias;
}

// ─── Desempate via Sonar ──────────────────────────────────────────────────────

async function fetchSonarDesempate(pais, campo, valorAnterior, valorNovo) {
  const campoJson = campoSnapshotParaJson(campo);

  const schemaProps = {};
  if (campo === "entrevista" || campo === "seguroSaude") {
    schemaProps[campoJson] = { type: ["boolean", "null"] };
  } else {
    schemaProps[campoJson] = { type: ["string", "null"] };
  }
  schemaProps["confianca"] = { type: "string" };

  const body = {
    model: "sonar",
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "visa_desempate",
        schema: {
          type: "object",
          properties: schemaProps,
          required: [campoJson, "confianca"],
        },
      },
    },
    messages: [
      {
        role: "system",
        content: `Você é um especialista em vistos internacionais para cidadãos brasileiros.
Use web search para verificar a informação mais atual possível.
Priorize fontes oficiais: embaixadas, consulados, gov.br, iata.org.
Retorne APENAS o JSON solicitado.`,
      },
      {
        role: "user",
        content: `Preciso verificar uma divergência nas informações de visto para brasileiros em ${pais}.

Campo em questão: "${campo}"
Valor encontrado anteriormente: ${JSON.stringify(valorAnterior)}
Valor encontrado agora: ${JSON.stringify(valorNovo)}

Pesquise e informe qual é o valor CORRETO e ATUAL para o campo "${campo}".
Retorne:
- "${campoJson}": o valor correto atual
- "confianca": "alta" se encontrou fonte oficial, "média" se fonte mista, "baixa" se incerto`,
      },
    ],
  };

  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Sonar API error: ${JSON.stringify(err)}`);
  }

  const apiData = await response.json();
  const content = apiData.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Resposta vazia do Sonar no desempate");
  }
  return JSON.parse(content);
}

// ─── Orquestrador de desempate ────────────────────────────────────────────────

export async function resolverDesempates(db, snapshotId, paisNome, divergencias) {
  if (!divergencias.length) {
    return;
  }

  logger.info(`[${paisNome}] Resolvendo ${divergencias.length} divergência(s) via Sonar...`);
  marcarSnapshotDivergente(db, snapshotId);

  for (const { campo, valorAnterior, valorNovo } of divergencias) {
    try {
      logger.info(
        `[${paisNome}] Desempate: "${campo}" — anterior="${valorAnterior}" novo="${valorNovo}"`,
      );

      const resultado = await fetchSonarDesempate(paisNome, campo, valorAnterior, valorNovo);
      const campoJson = campoSnapshotParaJson(campo);
      const valorResolvido = resultado[campoJson];
      const confianca = resultado.confianca ?? "baixa";

      insertDesempate(db, {
        snapshotId,
        campo,
        valorAnterior,
        valorNovo,
        valorResolvido,
        confianca,
      });

      logger.info(
        `[${paisNome}] Desempate "${campo}" resolvido: "${valorResolvido}" (confiança: ${confianca})`,
      );

      await notifyDiscord(
        `⚖️ **Desempate resolvido — ${paisNome}**\n` +
          `📋 **Campo:** ${campo}\n` +
          `📅 **Anterior:** ${valorAnterior}\n` +
          `🆕 **Novo:** ${valorNovo}\n` +
          `✅ **Resolvido:** ${valorResolvido}\n` +
          `🎯 **Confiança:** ${confianca}`,
      );
    } catch (err) {
      logger.error(`[${paisNome}] Erro no desempate do campo "${campo}": ${err.message}`);

      insertDesempate(db, {
        snapshotId,
        campo,
        valorAnterior,
        valorNovo,
        valorResolvido: null,
        confianca: "falhou",
      });

      await notifyDiscord(
        `❌ **Desempate falhou — ${paisNome}**\n` +
          `📋 **Campo:** ${campo}\n` +
          `📅 **Anterior:** ${valorAnterior}\n` +
          `🆕 **Novo:** ${valorNovo}\n` +
          `⚠️ **Erro:** ${err.message}`,
      );
    }
  }
}
