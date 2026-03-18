import "dotenv/config";
import readline from "node:readline";
import { validar } from "./validate.js";

const apiKey = process.env.PERPLEXITY_API_KEY;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("País destino (padrão: Portugal): ", async (input) => {
  const pais = input.trim() || "Portugal";

  const body = {
    model: "sonar",
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "visa_info",
        schema: {
          type: "object",
          properties: {
            typeLabel: { type: ["string", "null"] },
            visaName: { type: ["string", "null"] },
            prazo: { type: ["string", "null"] },
            tempoAntecedencia: { type: ["string", "null"] },
            validade: { type: ["string", "null"] },
            estadia: { type: ["string", "null"] },
            custo: { type: ["string", "null"] },
            solicitacao: { type: ["string", "null"] },
            entrevista: { type: ["boolean", "null"] },
            seguroSaude: { type: ["boolean", "null"] },
            comprovanteRetorno: { type: ["boolean", "null"] },
            validadeMinPassaporte: { type: ["string", "null"] },
            documentos: {
              type: ["array", "null"],
              items: { type: "string" },
            },
            vacinas: {
              type: ["array", "null"],
              items: { type: "string" },
            },
            consulados: {
              type: ["array", "null"],
              items: {
                type: "object",
                properties: {
                  cidade: { type: "string" },
                  site: { type: "string" },
                },
              },
            },
            observacoes: { type: ["string", "null"] },
            fonte: { type: ["array", "null"], items: { type: "string" } },
            atualizadoEm: { type: ["string", "null"] },
          },
          required: [
            "typeLabel",
            "visaName",
            "prazo",
            "tempoAntecedencia",
            "validade",
            "estadia",
            "custo",
            "solicitacao",
            "entrevista",
            "seguroSaude",
            "comprovanteRetorno",
            "validadeMinPassaporte",
            "documentos",
            "vacinas",
            "consulados",
            "observacoes",
            "fonte",
            "atualizadoEm",
          ],
        },
      },
    },
    messages: [
      {
        role: "system",
        content: `Você é um especialista em vistos internacionais para cidadãos brasileiros.
Use web search para buscar informações atualizadas sobre o país solicitado.
Priorize fontes oficiais: embaixadas, consulados, gov.br, iata.org, timaticweb2.
Se não encontrar informação confiável para um campo, retorne null e explique em "observacoes".`,
      },
      {
        role: "user",
        content: `País destino: ${pais}
Passaporte: Brasileiro
Finalidade da viagem: turismo

Pesquise e retorne um JSON com os campos abaixo. Normalize os valores para português brasileiro, em linguagem clara para o viajante. Sua resposta deve começar com { e terminar com }. Nenhum texto antes ou depois do JSON. Nenhum bloco de código, nenhum markdown, nenhuma explicação.

typeLabel             — Classificação do regime de entrada em linguagem simples. Ex: "Isento de visto", "Exige visto", "Visto na chegada".
visaName              — Nome oficial do visto ou autorização exigida. Null se não exigir.
prazo                 — Tempo estimado para obter o visto, em português. Ex: "3 business days" → "3 dias úteis". Null se não aplicável.
tempoAntecedencia     — Com quanto tempo de antecedência recomenda-se solicitar o visto antes da viagem. Null se não aplicável.
validade              — Por quanto tempo o visto é válido após emitido. Null se não aplicável.
estadia               — Tempo máximo de permanência por entrada ou período. Ex: "90 days per 180-day period" → "90 dias a cada 180 dias".
custo                 — Custo aproximado do visto em USD ou BRL. Null se gratuito ou isento.
solicitacao           — Como e onde solicitar o visto, em português, de forma direta.
entrevista            — true se exige entrevista presencial, false se não exige, null se não aplicável.
seguroSaude           — true se exige seguro saúde ou seguro viagem, false se não exige, null se não aplicável.
comprovanteRetorno    — true se exige comprovante de passagem de volta na imigração, false se não exige, null se não aplicável.
validadeMinPassaporte — Validade mínima exigida do passaporte. Ex: "6 meses além da data de retorno". Null se não há exigência específica.
documentos            — Array com a lista de documentos necessários para entrada ou solicitação do visto. Ex: ["Passaporte válido", "Comprovante de renda", "Seguro viagem"].
vacinas               — Array com vacinas obrigatórias para entrada. Ex: ["Febre amarela"]. Array vazio [] se não há exigência.
consulados            — Array com os principais consulados ou embaixadas do país no Brasil, com "cidade" e "site". Null se não aplicável.
observacoes           — Informações importantes ou alertas que não se encaixam nos campos acima. Null se não houver.
fonte                 — Array de URLs das fontes oficiais consultadas.
atualizadoEm          — Data da busca no formato "YYYY-MM-DD".`,
      },
    ],
  };

  try {
    console.log(`\nBuscando informações para: ${pais}...\n`);

    const apiResponse = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!apiResponse.ok) {
      const err = await apiResponse.json();
      console.error("Erro da API:", JSON.stringify(err, null, 2));
      return;
    }

    const apiData = await apiResponse.json();
    const content = apiData.choices?.[0]?.message?.content;

    if (!content) {
      console.error("Resposta vazia da API.");
      return;
    }

    const parsed = JSON.parse(content);
    const { valido, erros, data: visaData } = validar(parsed);

    if (erros.length) {
      console.warn("\nAvisos de validação:");
      erros.forEach((e) => console.warn(" ", e));
    }

    console.log(`\nDados ${valido ? "válidos ✓" : "com erros críticos ✗"}:`);
    console.log(JSON.stringify(visaData, null, 2));
  } catch (error) {
    console.error("Erro:", error.message);
  } finally {
    rl.close();
  }
});
