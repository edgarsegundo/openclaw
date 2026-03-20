import { logger } from "./logger.js";
import "dotenv/config";
const apiKey = process.env.PERPLEXITY_API_KEY;

export async function revalidar(pais, visaData, duvidas) {
  if (!duvidas.length) {
    return visaData;
  }

  const perguntas = duvidas.map((d, i) => `${i + 1}. ${d.pergunta}`).join("\n\n");

  const camposEmDuvida = [...new Set(duvidas.map((d) => d.campo))];

  // Monta schema dinamicamente com apenas os campos em dúvida
  const properties = {};
  for (const campo of camposEmDuvida) {
    if (campo === "documentos" || campo === "vacinas" || campo === "fonte") {
      properties[campo] = { type: "array", items: { type: "string" } };
    } else if (campo === "consulados") {
      properties[campo] = {
        type: ["array", "null"],
        items: {
          type: "object",
          properties: {
            cidade: { type: "string" },
            site: { type: "string" },
          },
        },
      };
    } else if (["entrevista", "seguroSaude", "comprovanteRetorno"].includes(campo)) {
      properties[campo] = { type: ["boolean", "null"] };
    } else {
      properties[campo] = { type: ["string", "null"] };
    }
  }

  const body = {
    model: "sonar",
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "visa_revalidation",
        schema: {
          type: "object",
          properties,
          required: camposEmDuvida,
        },
      },
    },
    messages: [
      {
        role: "system",
        content: `Você é um especialista em vistos internacionais para cidadãos brasileiros.
Use web search para buscar informações atualizadas e precisas.
Priorize fontes oficiais: embaixadas, consulados, gov.br, iata.org, timaticweb2.
Retorne APENAS o JSON solicitado, sem explicações.`,
      },
      {
        role: "user",
        content: `Preciso verificar informações de visto para brasileiros em ${pais}. Responda apenas as perguntas abaixo:\n\n${perguntas}`,
      },
    ],
  };

  logger.info(`[${pais}] Revalidando ${duvidas.length} campo(s): ${camposEmDuvida.join(", ")}...`);

  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json();
    logger.error(`[${pais}] Erro na revalidação: ${JSON.stringify(err)}`);
    return visaData;
  }

  const apiData = await response.json();
  const content = apiData.choices?.[0]?.message?.content;

  if (!content) {
    logger.warn(`[${pais}] Revalidação retornou resposta vazia.`);
    return visaData;
  }

  const correcoes = JSON.parse(content);

  logger.info(`[${pais}] Correções aplicadas: ${Object.keys(correcoes).join(", ")}`);

  // Merge: campos corrigidos sobrescrevem os originais
  return { ...visaData, ...correcoes };
}
