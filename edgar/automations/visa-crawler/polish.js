import { logger } from "./logger.js";

const API_KEY = process.env.PERPLEXITY_API_KEY;

// Campos que passam pela limpeza cosmética (todos exceto fonte e atualizadoEm)
const CAMPOS_TEXTO = [
  "typeLabel",
  "visaName",
  "prazo",
  "tempoAntecedencia",
  "validade",
  "estadia",
  "custo",
  "solicitacao",
  "validadeMinPassaporte",
  "confiabilidade",
  "observacoes",
];

const CAMPOS_ARRAY_TEXTO = ["documentos", "vacinas"];

const CAMPOS_OBJETO = ["consulados", "recursos"];

export async function polish(paisNome, dados) {
  // Extrai apenas os campos que precisam de limpeza
  const fragmento = {};
  for (const campo of CAMPOS_TEXTO) {
    if (dados[campo] !== null && dados[campo] !== undefined) {
      fragmento[campo] = dados[campo];
    }
  }
  for (const campo of CAMPOS_ARRAY_TEXTO) {
    if (Array.isArray(dados[campo]) && dados[campo].length > 0) {
      fragmento[campo] = dados[campo];
    }
  }
  for (const campo of CAMPOS_OBJETO) {
    if (Array.isArray(dados[campo]) && dados[campo].length > 0) {
      fragmento[campo] = dados[campo];
    }
  }

  const body = {
    model: "sonar",
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "visa_polish",
        schema: {
          type: "object",
          properties: Object.fromEntries(
            Object.keys(fragmento).map((campo) => {
              if (CAMPOS_TEXTO.includes(campo)) {
                return [campo, { type: ["string", "null"] }];
              }
              if (CAMPOS_ARRAY_TEXTO.includes(campo)) {
                return [campo, { type: "array", items: { type: "string" } }];
              }
              if (campo === "consulados") {
                return [
                  campo,
                  {
                    type: ["array", "null"],
                    items: {
                      type: "object",
                      properties: {
                        cidade: { type: "string" },
                        site: { type: "string" },
                      },
                    },
                  },
                ];
              }
              if (campo === "recursos") {
                return [
                  campo,
                  {
                    type: ["array", "null"],
                    items: {
                      type: "object",
                      properties: {
                        titulo: { type: "string" },
                        url: { type: "string" },
                        tipo: { type: "string" },
                      },
                    },
                  },
                ];
              }
              return [campo, { type: ["string", "null"] }];
            }),
          ),
          required: Object.keys(fragmento),
        },
      },
    },
    messages: [
      {
        role: "system",
        content: `Você é um editor de textos especializado em informações de viagem para brasileiros.
Sua tarefa é fazer APENAS ajustes cosméticos mínimos nos textos fornecidos para melhorar a apresentação ao usuário final.
Regras estritas — leia com atenção:
- NÃO altere o significado, sentido ou conteúdo das informações
- NÃO invente, adicione ou remova informações — nem detalhes, nem especificações
- NÃO use web search — trabalhe SOMENTE com o texto fornecido, sem buscar dados externos
- NÃO acrescente informações que não estão no texto original, mesmo que sejam verdadeiras
- REMOVA apenas marcadores de citação como [1], [2], [3] e similares
- REMOVA siglas ou nomes técnicos de sistemas quando estiverem soltos e sem contexto (ex: "(ImmiAccount)")
- CORRIJA apenas frases claramente mal construídas, mantendo as palavras originais sempre que possível
- Em arrays como "documentos", altere SOMENTE a formatação do texto, nunca o conteúdo de cada item
- MANTENHA o tom informativo e claro
- Retorne APENAS o JSON com os mesmos campos recebidos, sem explicações`,
      },
      {
        role: "user",
        content: `Revise e faça ajustes cosméticos nos seguintes campos de informação de visto para ${paisNome}. Retorne o JSON com os mesmos campos, aplicando apenas melhorias de apresentação:\n\n${JSON.stringify(fragmento, null, 2)}`,
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
    throw new Error("Resposta vazia na limpeza cosmética");
  }

  let polished;
  try {
    polished = JSON.parse(content);
  } catch {
    throw new Error("JSON inválido retornado na limpeza cosmética");
  }

  // Logar campos que foram alterados
  const alterados = [];
  for (const campo of Object.keys(polished)) {
    const antes = JSON.stringify(fragmento[campo]);
    const depois = JSON.stringify(polished[campo]);
    if (antes !== depois) {
      alterados.push(campo);
    }
  }

  if (alterados.length > 0) {
    logger.info(`[${paisNome}] Limpeza cosmética alterou: ${alterados.join(", ")}`);
    for (const campo of alterados) {
      const antes = Array.isArray(fragmento[campo])
        ? JSON.stringify(fragmento[campo])
        : String(fragmento[campo]);
      const depois = Array.isArray(polished[campo])
        ? JSON.stringify(polished[campo])
        : String(polished[campo]);
      logger.debug(`[${paisNome}] polish "${campo}":\n  antes:  ${antes}\n  depois: ${depois}`);
    }
  } else {
    logger.debug(`[${paisNome}] Limpeza cosmética sem alterações.`);
  }

  // Merge: sobrescreve apenas os campos limpos, preserva o resto
  return { ...dados, ...polished };
}
