/**
 * SonarClient — Perplexity Sonar API client with native JSON Schema support.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SOBRE ESTE CLIENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Diferente de um LLM comum, o Sonar faz buscas reais na web antes de responder.
 * Isso significa que a resposta não é só o conteúdo gerado — ela vem acompanhada
 * de metadados ricos sobre as fontes consultadas, custo detalhado por componente,
 * e (no caso do sonar-reasoning-pro) o raciocínio passo-a-passo do modelo.
 *
 * Este client retorna TUDO que a API disponibiliza, encapsulado em um objeto
 * tipado via JSDoc para facilitar o uso com IntelliSense.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ANATOMIA COMPLETA DA RESPOSTA DA API
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A API retorna um objeto com os seguintes campos úteis na raiz:
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ CAMPO            │ TIPO             │ DESCRIÇÃO                         │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │ id               │ string           │ ID único da requisição (útil para  │
 * │                  │                  │ logs, rastreamento, suporte)        │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │ model            │ string           │ Modelo efetivamente usado.          │
 * │                  │                  │ Confirmar quando se usa fallbacks   │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │ created          │ number           │ Unix timestamp da criação.          │
 * │                  │                  │ Útil para cache, expiração, logs    │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │ citations        │ string[]         │ Array de URLs das fontes usadas.    │
 * │                  │                  │ O índice é 0-based aqui, mas os     │
 * │                  │                  │ marcadores no texto são 1-based:    │
 * │                  │                  │ [1] → citations[0]                  │
 * │                  │                  │ [2] → citations[1]                  │
 * │                  │                  │ Use case: links de "saiba mais",    │
 * │                  │                  │ rodapés de referência, auditoria    │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │ search_results   │ SearchResult[]   │ Metadados RICOS de cada fonte.      │
 * │                  │                  │ Alinhado 1:1 com citations[].       │
 * │                  │                  │                                     │
 * │                  │                  │ Cada item contém:                   │
 * │                  │                  │  • title    – título da página      │
 * │                  │                  │  • url      – URL da fonte          │
 * │                  │                  │  • date     – data de publicação    │
 * │                  │                  │  • last_updated – última atualiz.   │
 * │                  │                  │  • snippet  – trecho relevante      │
 * │                  │                  │  • source   – "web" | "academic"    │
 * │                  │                  │                                     │
 * │                  │                  │ Use cases:                          │
 * │                  │                  │  • Cards de fonte com título +      │
 * │                  │                  │    snippet (muito melhor que URL)   │
 * │                  │                  │  • Verificar se fontes são recentes │
 * │                  │                  │  • Filtrar fontes acadêmicas        │
 * │                  │                  │  • UI estilo "pesquisa" com preview │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │ usage            │ UsageInfo        │ Tokens consumidos + custo USD.      │
 * │                  │                  │                                     │
 * │                  │                  │ Subcampos:                          │
 * │                  │                  │  • prompt_tokens – tokens de input  │
 * │                  │                  │  • completion_tokens – output       │
 * │                  │                  │  • citation_tokens – tokens das     │
 * │                  │                  │    fontes (pode ser grande!)        │
 * │                  │                  │  • num_search_queries – nº de       │
 * │                  │                  │    buscas feitas pelo modelo        │
 * │                  │                  │  • reasoning_tokens – só em         │
 * │                  │                  │    sonar-reasoning-pro              │
 * │                  │                  │  • search_context_size – "low" |    │
 * │                  │                  │    "medium" | "high"                │
 * │                  │                  │                                     │
 * │                  │                  │  • cost.input_tokens_cost  (USD)    │
 * │                  │                  │  • cost.output_tokens_cost (USD)    │
 * │                  │                  │  • cost.citation_tokens_cost (USD)  │
 * │                  │                  │  • cost.search_queries_cost (USD)   │
 * │                  │                  │  • cost.reasoning_tokens_cost (USD) │
 * │                  │                  │  • cost.request_cost (USD)          │
 * │                  │                  │  • cost.total_cost (USD) ← o mais  │
 * │                  │                  │    importante para billing          │
 * │                  │                  │                                     │
 * │                  │                  │ Use cases:                          │
 * │                  │                  │  • Dashboard de custo por feature   │
 * │                  │                  │  • Alertas de budget                │
 * │                  │                  │  • Decidir se vale usar sonar-pro   │
 * │                  │                  │    vs sonar em cada rota            │
 * │                  │                  │  • Detectar queries caras           │
 * │                  │                  │    (citation_tokens alto = muitas   │
 * │                  │                  │    fontes longas foram lidas)       │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │ reasoning_steps  │ ReasoningStep[]  │ Só sonar-reasoning-pro.             │
 * │                  │                  │ Expõe o chain-of-thought:           │
 * │                  │                  │  • thought – o raciocínio em texto  │
 * │                  │                  │  • type – "web_search" |            │
 * │                  │                  │           "fetch_url_content" |     │
 * │                  │                  │           "execute_python"          │
 * │                  │                  │  • web_search.search_keywords –     │
 * │                  │                  │    termos que o modelo buscou       │
 * │                  │                  │  • web_search.search_results –      │
 * │                  │                  │    resultados intermediários        │
 * │                  │                  │                                     │
 * │                  │                  │ Use cases:                          │
 * │                  │                  │  • Debug de por que o modelo errou  │
 * │                  │                  │  • Mostrar "transparência" pro       │
 * │                  │                  │    usuário (como o Perplexity faz)  │
 * │                  │                  │  • Extrair keywords de busca para   │
 * │                  │                  │    reusar em outras queries         │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MODELOS DISPONÍVEIS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  sonar              – Rápido, barato. 127k ctx. Ideal para Q&A simples,
 *                       fact-checking, queries de baixo volume.
 *
 *  sonar-pro          – Maior qualidade, mais citações (~2x), 200k ctx.
 *                       Ideal para pesquisa, conteúdo editorial, respostas
 *                       que exigem múltiplas fontes cruzadas.
 *
 *  sonar-reasoning-pro – Multi-step reasoning com chain-of-thought exposto
 *                        via reasoning_steps[]. Mais lento e caro.
 *                        Ideal para análises complexas, decisões de múltiplos
 *                        passos, onde o "porquê" importa tanto quanto o resultado.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SOBRE LINKS EM JSON SCHEMA
 * ─────────────────────────────────────────────────────────────────────────────
 * NÃO inclua campos de URL no seu schema JSON — o modelo tende a alucinar URLs.
 * Sempre use citations[] e search_results[] para URLs válidas de fontes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * USO BÁSICO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   const client = new SonarClient({ apiKey: process.env.PERPLEXITY_API_KEY });
 *
 *   const result = await client.generate({
 *     systemPrompt: "Você é um especialista em vistos.",
 *     userPrompt: "Brasileiros precisam de visto para o Japão?",
 *     schema: {
 *       type: "object",
 *       properties: {
 *         visaRequired: { type: "boolean" },
 *         maxStayDays:  { type: "number" },
 *         notes:        { type: "string" },
 *       },
 *       required: ["visaRequired"],
 *     },
 *   });
 *
 *   console.log(result.data);           // { visaRequired: true, maxStayDays: 90, ... }
 *   console.log(result.citations);      // ["https://...", "https://..."]
 *   console.log(result.searchResults);  // [{ title, url, snippet, date }, ...]
 *   console.log(result.usage.cost.total_cost);  // 0.0124 (USD)
 */

import { BaseClient } from "./base-client.js";

// ─────────────────────────────────────────────────────────────────────────────
// JSDoc Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {object} SearchResult
 * @property {string} title        - Título da página fonte
 * @property {string} url          - URL da fonte
 * @property {string} [date]       - Data de publicação (ISO string ou legível)
 * @property {string} [last_updated] - Data da última atualização do conteúdo
 * @property {string} snippet      - Trecho relevante extraído da fonte
 * @property {string} source       - "web" | "academic"
 */

/**
 * @typedef {object} CostBreakdown
 * @property {number} input_tokens_cost      - Custo dos tokens de input (USD)
 * @property {number} output_tokens_cost     - Custo dos tokens de output (USD)
 * @property {number} citation_tokens_cost   - Custo de processar as fontes (USD)
 * @property {number} search_queries_cost    - Custo das buscas realizadas (USD)
 * @property {number} reasoning_tokens_cost  - Custo do chain-of-thought, se houver (USD)
 * @property {number} request_cost           - Custo fixo por request (USD)
 * @property {number} total_cost             - Custo total da chamada (USD)
 */

/**
 * @typedef {object} UsageInfo
 * @property {number} prompt_tokens        - Tokens consumidos pelo input/prompt
 * @property {number} completion_tokens    - Tokens consumidos pela resposta gerada
 * @property {number} total_tokens         - Total de tokens (prompt + completion)
 * @property {number} citation_tokens      - Tokens consumidos pelo conteúdo das fontes
 * @property {number} num_search_queries   - Quantas buscas o modelo realizou
 * @property {number} [reasoning_tokens]   - Tokens de raciocínio (sonar-reasoning-pro)
 * @property {string} search_context_size  - "low" | "medium" | "high"
 * @property {CostBreakdown} [cost]        - Custo detalhado por componente em USD
 */

/**
 * @typedef {object} WebSearchStep
 * @property {string[]} search_keywords - Termos que o modelo buscou na web
 * @property {SearchResult[]} search_results - Resultados intermediários da busca
 */

/**
 * @typedef {object} FetchUrlStep
 * @property {SearchResult[]} contents - Conteúdo das URLs que o modelo acessou
 */

/**
 * @typedef {object} ReasoningStep
 * @property {string} thought              - O pensamento do modelo neste passo
 * @property {string} type                 - "web_search" | "fetch_url_content" | "execute_python"
 * @property {WebSearchStep} [web_search]           - Detalhes se type === "web_search"
 * @property {FetchUrlStep}  [fetch_url_content]    - Detalhes se type === "fetch_url_content"
 * @property {{ code: string, result: string }} [execute_python] - Código executado e resultado
 */

/**
 * @template T
 * @typedef {object} SonarResult
 * @property {T}               data           - Objeto parseado conforme o JSON Schema fornecido
 * @property {string[]}        citations      - URLs das fontes (1-indexed nos marcadores do texto: [1] → citations[0])
 * @property {SearchResult[]}  searchResults  - Metadados ricos das fontes (alinhado 1:1 com citations)
 * @property {ReasoningStep[]} reasoningSteps - Passos de raciocínio (sonar-reasoning-pro apenas)
 * @property {UsageInfo}       usage          - Tokens consumidos e custo detalhado em USD
 * @property {string}          model          - Modelo que efetivamente processou a requisição
 * @property {string}          requestId      - ID único da requisição (útil para logs e suporte)
 * @property {number}          createdAt      - Unix timestamp da criação da resposta
 */

// ─────────────────────────────────────────────────────────────────────────────
// SonarClient
// ─────────────────────────────────────────────────────────────────────────────

export class SonarClient extends BaseClient {
  /**
   * @param {object} opts
   * @param {string} opts.apiKey          - PERPLEXITY_API_KEY
   * @param {string} [opts.model]         - Modelo a usar. Default: "sonar".
   *                                        Opções: "sonar" | "sonar-pro" | "sonar-reasoning-pro"
   * @param {number} [opts.maxRetries]    - Tentativas em caso de falha. Default: 2
   * @param {number} [opts.timeoutMs]     - Timeout por tentativa em ms. Default: 30000
   * @param {object} [opts.logger]        - Logger compatível com console
   */
  constructor({ apiKey, model = "sonar", maxRetries = 2, timeoutMs = 30000, logger = console }) {
    super({ maxRetries, timeoutMs, logger });
    if (!apiKey) {
      throw new Error("SonarClient: apiKey is required.");
    }
    this.apiKey = apiKey;
    this.model = model;
  }

  /**
   * Chama a API Perplexity com structured output e retorna dados + metadados completos.
   *
   * @template T
   * @param {object} opts
   * @param {string}   opts.userPrompt       - Mensagem do usuário
   * @param {string}   [opts.systemPrompt]   - Instrução de sistema (opcional)
   * @param {object}   opts.schema           - JSON Schema da resposta esperada
   * @param {string}   [opts.schemaName]     - Nome do schema (default: "response").
   *                                           Deve ter 1-64 caracteres alfanuméricos.
   * @param {number}   [opts.temperature]    - Temperatura (default: 0.2 para tarefas factuais)
   * @param {import("zod").ZodType<T>} [opts.zodSchema] - Schema Zod para validar result.data
   *
   * @returns {Promise<SonarResult<T>>}
   */
  async generate({
    userPrompt,
    systemPrompt,
    schema,
    schemaName = "response",
    temperature = 0.2,
    zodSchema,
  }) {
    if (!userPrompt) {
      throw new Error("SonarClient.generate: userPrompt is required.");
    }
    if (!schema) {
      throw new Error("SonarClient.generate: schema is required.");
    }

    const messages = this._buildMessages(systemPrompt, userPrompt);

    const body = {
      model: this.model,
      temperature,
      messages,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: schemaName,
          schema,
        },
      },
    };

    return this._withRetry(async () => {
      const result = await this._withTimeout(() => this._fetch(body));

      // Valida apenas result.data contra o Zod schema, preservando os metadados
      if (zodSchema) {
        const validation = zodSchema.safeParse(result.data);
        if (!validation.success) {
          throw new Error(
            `SonarClient: Zod validation failed: ${JSON.stringify(validation.error.errors)}`,
          );
        }
        return { ...result, data: validation.data };
      }

      return result;
    }, `model: ${this.model}`);
  }

  /**
   * Executa a chamada HTTP e extrai todos os campos úteis da resposta.
   *
   * @param {object} body - Payload da requisição
   * @returns {Promise<SonarResult<object>>}
   */
  async _fetch(body) {
    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(
        `SonarClient: API error ${response.status}: ${err.error?.message ?? JSON.stringify(err)}`,
      );
    }

    const raw = await response.json();

    // ── Extrai o conteúdo gerado ─────────────────────────────────────────────
    const content = raw.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("SonarClient: API returned empty content.");
    }

    // ── Parseia o JSON estruturado do content ────────────────────────────────
    // Com response_format.json_schema o Sonar retorna JSON limpo, mas por
    // segurança tentamos extrair caso venha com texto ao redor.
    let data;
    try {
      data = JSON.parse(content);
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) {
        throw new Error(
          `SonarClient: Could not parse JSON from response: ${content.slice(0, 200)}`,
        );
      }
      data = JSON.parse(match[0]);
    }

    // ── Monta o resultado rico ───────────────────────────────────────────────
    return {
      // O objeto JSON conforme o schema fornecido
      data,

      // URLs das fontes consultadas.
      // Alinhamento: citations[N] corresponde ao marcador [N+1] no texto gerado.
      // Ex: [1] no texto → citations[0], [2] → citations[1], etc.
      citations: raw.citations ?? [],

      // Metadados completos das fontes, alinhados 1:1 com citations[].
      // Preferível a citations[] quando você quer exibir título + snippet.
      searchResults: raw.search_results ?? [],

      // Passos de raciocínio do modelo (sonar-reasoning-pro apenas).
      // Vazio [] para sonar e sonar-pro.
      reasoningSteps: raw.choices?.[0]?.message?.reasoning_steps ?? [],

      // Métricas de consumo e custo detalhado.
      // usage.cost.total_cost é o campo mais útil para billing.
      usage: raw.usage ?? {},

      // Modelo que processou a requisição (confirmar quando usar fallbacks).
      model: raw.model,

      // ID único da requisição. Guardar em logs para correlação e suporte.
      requestId: raw.id,

      // Unix timestamp de quando a resposta foi criada.
      // Útil para cache com TTL, auditoria, e ordenação de logs.
      createdAt: raw.created,
    };
  }
}
