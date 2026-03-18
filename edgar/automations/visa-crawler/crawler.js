import { detectarDivergencias, resolverDesempates } from "./compare.js";
import { getUltimoSnapshot, arquivarSnapshotsAnteriores, insertSnapshot } from "./db.js";
import { notifyDiscord } from "./discord.js";
import { healthcheck } from "./healthcheck.js";
import { logger } from "./logger.js";
import { revalidar } from "./revalidate.js";
import { validar } from "./validate.js";

const API_KEY = process.env.PERPLEXITY_API_KEY;
const HEALTHCHECK_ENABLED = process.env.HEALTHCHECK !== "false";

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchSonar(body) {
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
prazo                 — Tempo estimado para obter o visto, em português. Null se não aplicável.
tempoAntecedencia     — Com quanto tempo de antecedência recomenda-se solicitar o visto. Null se não aplicável.
validade              — Por quanto tempo o visto é válido após emitido. Null se não aplicável.
estadia               — Tempo máximo de permanência por entrada ou período.
custo                 — Custo aproximado do visto em USD ou BRL. Null se gratuito ou isento.
solicitacao           — Como e onde solicitar o visto, em português, de forma direta.
entrevista            — true se exige entrevista presencial, false se não exige, null se não aplicável.
seguroSaude           — true se exige seguro saúde ou seguro viagem, false se não exige, null se não aplicável.
comprovanteRetorno    — true se exige comprovante de passagem de volta, false se não, null se não aplicável.
validadeMinPassaporte — Validade mínima exigida do passaporte. Null se não há exigência específica.
confiabilidade        — "alta" (fontes oficiais), "média" (fontes mistas), "baixa" (sem fontes oficiais).
documentos            — Array com documentos necessários. Ex: ["Passaporte válido", "Comprovante de renda"].
vacinas               — Array com vacinas obrigatórias. Array vazio [] se não há exigência.
consulados            — Array com consulados no Brasil: [{"cidade": string, "site": string}]. Null se não aplicável.
observacoes           — Informações importantes ou alertas. Null se não houver.
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
- Threads em fóruns como Reddit (r/vzavista, r/brcombr, r/travel, r/solotravel)
- Conteúdo oficial do consulado ou embaixada, se disponível
- Tutoriais completos em blogs de viagem brasileiros
${paisDificil ? "- Relatos em grupos de Facebook, comunidades de viagem ou qualquer fonte alternativa" : ""}

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

// ─── Processamento de um país ─────────────────────────────────────────────────

export async function processarPais(db, paisId, paisNome) {
  logger.info(`[${paisNome}] Iniciando coleta...`);

  let visaRaw;
  try {
    visaRaw = await fetchSonar(buildBodyPrincipal(paisNome));
  } catch (err) {
    const causa = err.cause ? ` — causa: ${String(err.cause)}` : "";
    logger.error(`[${paisNome}] Erro na consulta principal: ${err.message}${causa}`);
    await notifyDiscord(
      `❌ **visa-crawler — erro na consulta principal**\n🌍 **País:** ${paisNome}\n⚠️ **Erro:** ${err.message}${causa}`,
    );
    throw err;
  }

  const confiabilidade = visaRaw.confiabilidade ?? null;

  let recursosRaw;
  try {
    recursosRaw = await fetchSonar(buildBodyRecursos(paisNome, confiabilidade));
  } catch (err) {
    logger.warn(`[${paisNome}] Erro na consulta de recursos (não crítico): ${err.message}`);
    recursosRaw = { recursos: [] };
  }

  const merged = { ...visaRaw, recursos: recursosRaw.recursos ?? null };

  // Validação
  const erros = [];
  const { valido, erros: errosValidacao, duvidas, data: visaData } = validar(merged, paisNome);

  if (errosValidacao.length) {
    logger.warn(`[${paisNome}] Avisos de validação:`);
    errosValidacao.forEach((e) => logger.warn(`  ${e}`));
  }

  // Revalidação + healthcheck em paralelo
  if (HEALTHCHECK_ENABLED) {
    logger.debug(`[${paisNome}] Verificando URLs dos recursos...`);
  }

  const [dadosFinais] = await Promise.all([
    duvidas.length ? revalidar(paisNome, visaData, duvidas) : Promise.resolve(visaData),
    HEALTHCHECK_ENABLED ? healthcheck(visaData, erros) : Promise.resolve(),
  ]);

  if (
    HEALTHCHECK_ENABLED &&
    erros.some((e) => e.includes("inacessível") || e.includes("removido"))
  ) {
    erros
      .filter((e) => e.includes("inacessível") || e.includes("removido"))
      .forEach((e) => logger.warn(`[${paisNome}] ${e}`));
  }

  // Comparar com snapshot anterior
  const snapshotAnterior = getUltimoSnapshot(db, paisId);
  const divergencias = detectarDivergencias(snapshotAnterior, dadosFinais);

  // Arquivar snapshot anterior e inserir novo
  arquivarSnapshotsAnteriores(db, paisId);
  const snapshotId = insertSnapshot(db, { paisId, data: dadosFinais });

  logger.info(`[${paisNome}] Snapshot #${snapshotId} salvo. Divergências: ${divergencias.length}`);

  // Resolver desempates se houver divergências
  if (divergencias.length > 0) {
    await resolverDesempates(db, snapshotId, paisId, paisNome, divergencias);

    await notifyDiscord(
      `⚠️ **Divergência detectada — ${paisNome}**\n` +
        `📋 **Campos divergentes:** ${divergencias.map((d) => d.campo).join(", ")}\n` +
        `🔍 **Desempate iniciado automaticamente**`,
    );
  } else if (snapshotAnterior) {
    logger.info(`[${paisNome}] Nenhuma divergência nos campos críticos.`);
  } else {
    logger.info(`[${paisNome}] Primeiro snapshot registrado.`);
  }

  return { snapshotId, divergencias: divergencias.length, valido };
}
