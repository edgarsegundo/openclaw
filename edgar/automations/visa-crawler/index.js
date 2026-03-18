import "dotenv/config";
import readline from "node:readline";
import { healthcheck } from "./healthcheck.js";
import { revalidar } from "./revalidate.js";
import { validar } from "./validate.js";

const apiKey = process.env.PERPLEXITY_API_KEY;
const HEALTHCHECK_ENABLED = process.env.HEALTHCHECK !== "false";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function fetchSonar(body) {
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
    throw new Error(`API error: ${JSON.stringify(err)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Resposta vazia da API.");
  }
  return JSON.parse(content);
}

function buildBodyPrincipal(pais) {
  return {
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
            confiabilidade: { type: ["string", "null"] },
            documentos: { type: ["array", "null"], items: { type: "string" } },
            vacinas: { type: ["array", "null"], items: { type: "string" } },
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
            "confiabilidade",
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
confiabilidade        — Nível de confiança nas informações encontradas: "alta" (fontes oficiais encontradas), "média" (fontes mistas ou desatualizadas), "baixa" (sem fontes oficiais acessíveis, país com acesso restrito ou informações escassas).
documentos            — Array com a lista de documentos necessários. Ex: ["Passaporte válido", "Comprovante de renda"].
vacinas               — Array com vacinas obrigatórias para entrada. Array vazio [] se não há exigência.
consulados            — Array com os principais consulados ou embaixadas do país no Brasil, com "cidade" e "site". Null se não aplicável.
observacoes           — Informações importantes ou alertas que não se encaixam nos campos acima. Null se não houver.
fonte                 — Array de URLs APENAS de fontes governamentais ou oficiais (embaixadas, consulados, sites .gov). Nunca inclua blogs, portais de viagem ou agregadores.
atualizadoEm          — Data da busca no formato "YYYY-MM-DD".`,
      },
    ],
  };
}

function buildBodyRecursos(pais, confiabilidade = null) {
  const paisDificil = confiabilidade === "baixa";
  return {
    model: "sonar",
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "visa_recursos",
        schema: {
          type: "object",
          properties: {
            recursos: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  titulo: { type: "string" },
                  url: { type: "string" },
                  tipo: { type: "string" },
                },
                required: ["titulo", "url", "tipo"],
              },
            },
          },
          required: ["recursos"],
        },
      },
    },
    messages: [
      {
        role: "system",
        content: `Você é um especialista em pesquisa de conteúdo sobre viagens internacionais para brasileiros.
Busque conteúdos variados, atualizados e de qualidade sobre o processo de visto solicitado.
Priorize conteúdo em português brasileiro quando disponível.
Mesmo que as informações oficiais sejam escassas, busque ativamente relatos de viajantes, grupos de Facebook, fóruns e qualquer conteúdo útil disponível.`,
      },
      {
        role: "user",
        content: `Busque para brasileiros que querem viajar para ${pais}${paisDificil ? " (país com informações oficiais escassas ou acesso restrito)" : ""}:
- Artigos atualizados explicando o processo de entrada ou visto
- Vídeos no YouTube com relatos reais ou tutoriais passo a passo
- Threads em fóruns como Reddit (r/vzavista, r/brcombr, r/travel, r/solotravel) com relatos de quem já passou pelo processo
- Conteúdo oficial do consulado ou embaixada, se disponível
- Tutoriais completos em blogs de viagem brasileiros
${paisDificil ? "- Relatos em grupos de Facebook, comunidades de viagem ou qualquer fonte alternativa disponível" : ""}

Retorne no mínimo 3 recursos, mesmo que sejam de fontes não oficiais.
Retorne um array "recursos" onde cada item tem:
- "titulo": nome descritivo do conteúdo
- "url": link direto
- "tipo": um de "artigo", "vídeo", "fórum", "oficial", "tutorial", "relato"

Retorne APENAS o JSON. Nenhum texto antes ou depois.`,
      },
    ],
  };
}

rl.question("País destino (padrão: Portugal): ", async (input) => {
  const pais = input.trim() || "Portugal";

  try {
    console.log(`\nBuscando informações para: ${pais}...\n`);

    // consulta principal primeiro para obter confiabilidade
    const visaRaw = await fetchSonar(buildBodyPrincipal(pais));
    const confiabilidade = visaRaw.confiabilidade ?? null;

    // consulta de recursos em paralelo com revalidação se necessário
    const recursosRaw = await fetchSonar(buildBodyRecursos(pais, confiabilidade));

    // merge antes de validar
    const merged = { ...visaRaw, recursos: recursosRaw.recursos ?? null };

    const { valido, erros, duvidas, data: visaData } = validar(merged, pais);

    if (erros.length) {
      console.warn("\nAvisos de validação:");
      erros.forEach((e) => console.warn(" ", e));
    }

    // healthcheck de URLs em paralelo com revalidação
    if (HEALTHCHECK_ENABLED) {
      console.log("Verificando URLs dos recursos...");
    }
    const [dadosFinais] = await Promise.all([
      duvidas.length ? revalidar(pais, visaData, duvidas) : Promise.resolve(visaData),
      HEALTHCHECK_ENABLED ? healthcheck(visaData, erros) : Promise.resolve(),
    ]);

    if (
      HEALTHCHECK_ENABLED &&
      erros.some((e) => e.includes("inacessível") || e.includes("removido"))
    ) {
      console.warn("\nAvisos pós-healthcheck:");
      erros
        .filter((e) => e.includes("inacessível") || e.includes("removido"))
        .forEach((e) => console.warn(" ", e));
    }

    console.log(`\nDados ${valido ? "válidos ✓" : "com erros críticos ✗"}:`);
    console.log(JSON.stringify(dadosFinais, null, 2));
  } catch (error) {
    console.error("Erro:", error.message);
  } finally {
    rl.close();
  }
});
