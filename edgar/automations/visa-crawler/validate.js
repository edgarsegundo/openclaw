const CAMPOS_BOOLEANOS = ["entrevista", "seguroSaude", "comprovanteRetorno"];

const CAMPOS_ARRAY = ["documentos", "vacinas", "consulados", "fonte", "recursos"];

const CAMPOS_OBRIGATORIOS = [
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
  "recursos",
  "observacoes",
  "fonte",
  "atualizadoEm",
];

const CONFIABILIDADE_VALIDOS = ["alta", "média", "baixa"];

function corrigirBooleanos(data, erros) {
  for (const campo of CAMPOS_BOOLEANOS) {
    if (typeof data[campo] === "string") {
      erros.push(
        `[auto-corrigido] "${campo}": veio como string "${data[campo]}", convertido para boolean`,
      );
      data[campo] = data[campo].toLowerCase() === "true";
    }
  }
}

function corrigirArrays(data, erros) {
  for (const campo of CAMPOS_ARRAY) {
    if (data[campo] === null || data[campo] === undefined) {
      if (campo === "vacinas" || campo === "documentos") {
        erros.push(`[auto-corrigido] "${campo}": null convertido para []`);
        data[campo] = [];
      }
    } else if (!Array.isArray(data[campo])) {
      erros.push(`[erro] "${campo}": esperado array, recebido ${typeof data[campo]}`);
    }
  }
}

function validarCamposObrigatorios(data, erros) {
  for (const campo of CAMPOS_OBRIGATORIOS) {
    if (!(campo in data)) {
      erros.push(`[erro] "${campo}": campo ausente na resposta`);
    }
  }
}

function validarConfiabilidade(data, erros) {
  if (!data.confiabilidade) {
    erros.push('[aviso] "confiabilidade": null — nível de confiança não informado');
    return;
  }
  const normalizado = data.confiabilidade
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (
    !CONFIABILIDADE_VALIDOS.some(
      (v) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "") === normalizado,
    )
  ) {
    erros.push(
      `[aviso] "confiabilidade": valor inesperado — "${data.confiabilidade}". Esperado: alta, média ou baixa`,
    );
  }
}

function validarCoerenciaSemantica(data, erros, duvidas) {
  const isento = data.typeLabel?.toLowerCase().includes("isento");
  const exigeVisto = data.typeLabel?.toLowerCase().includes("exige");
  const pais = data._pais || "este país";

  if (isento) {
    if (data.entrevista === true) {
      erros.push('[aviso] "entrevista": true, mas typeLabel indica isenção de visto');
      duvidas.push({
        campo: "entrevista",
        pergunta: `Para brasileiros em ${pais}: o regime é realmente isenção de visto? Se sim, confirme que não há entrevista obrigatória. Retorne JSON: { "typeLabel": string, "entrevista": boolean }`,
      });
    }
    if (data.custo && data.custo !== null) {
      erros.push('[aviso] "custo": preenchido, mas typeLabel indica isenção de visto');
      duvidas.push({
        campo: "custo",
        pergunta: `Para brasileiros em ${pais}: há algum custo de taxa ou autorização mesmo sendo isento de visto? Retorne JSON: { "typeLabel": string, "custo": string | null }`,
      });
    }
  }

  if (exigeVisto) {
    if (!data.custo) {
      erros.push('[aviso] "custo": null, mas país exige visto — qual o valor da taxa?');
      duvidas.push({
        campo: "custo",
        pergunta: `Para brasileiros solicitando "${data.visaName || "visto"}" em ${pais}: qual o custo oficial da taxa de visto em USD ou moeda local? Retorne JSON: { "custo": string }`,
      });
    }
    if (!data.documentos?.length) {
      erros.push(
        '[aviso] "documentos": vazio, mas país exige visto — quais os documentos necessários?',
      );
      duvidas.push({
        campo: "documentos",
        pergunta: `Para brasileiros solicitando "${data.visaName || "visto"}" em ${pais}: quais os documentos obrigatórios? Retorne JSON: { "documentos": string[] }`,
      });
    }
  }

  if (data.entrevista === true && !data.consulados?.length) {
    erros.push(
      '[aviso] "entrevista": true, mas "consulados" está vazio — onde o viajante comparece?',
    );
    duvidas.push({
      campo: "consulados",
      pergunta: `Para brasileiros solicitando "${data.visaName || "visto"}" em ${pais}: onde ocorre a entrevista presencial? Liste os consulados/embaixadas no Brasil com cidade e site oficial. Retorne JSON: { "consulados": [{ "cidade": string, "site": string }] }`,
    });
  }

  if (data.consulados?.length) {
    const comSiteInvalido = data.consulados.filter((c) => !c.site || !c.site.startsWith("http"));
    if (comSiteInvalido.length) {
      for (const c of comSiteInvalido) {
        if (!c.cidade) {
          erros.push('[aviso] "consulados": item sem "cidade"');
        }
        if (!c.site) {
          erros.push('[aviso] "consulados": item sem "site"');
        } else {
          erros.push(`[aviso] "consulados": site inválido — "${c.site}"`);
        }
      }
      duvidas.push({
        campo: "consulados",
        pergunta: `Para brasileiros em ${pais}: confirme os sites oficiais dos consulados/embaixadas no Brasil. Retorne JSON: { "consulados": [{ "cidade": string, "site": string }] }`,
      });
    }
  }

  const schengen =
    data.estadia?.toLowerCase().includes("schengen") ||
    data.typeLabel?.toLowerCase().includes("schengen");
  if (!data.validadeMinPassaporte && (schengen || exigeVisto)) {
    erros.push(
      '[aviso] "validadeMinPassaporte": null — há exigência de validade mínima do passaporte?',
    );
    duvidas.push({
      campo: "validadeMinPassaporte",
      pergunta: `Para brasileiros entrando em ${pais}: qual a validade mínima exigida do passaporte? Retorne JSON: { "validadeMinPassaporte": string | null }`,
    });
  }
}

function validarData(data, erros) {
  if (!data.atualizadoEm) {
    return;
  }

  if (isNaN(Date.parse(data.atualizadoEm))) {
    erros.push(`[erro] "atualizadoEm": data inválida — "${data.atualizadoEm}"`);
    return;
  }

  const diff = Date.now() - new Date(data.atualizadoEm).getTime();
  const diasAtras = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (diasAtras > 30) {
    erros.push(`[aviso] "atualizadoEm": dado com ${diasAtras} dias — pode estar desatualizado`);
  }
}

function sanitizarFontes(data, erros) {
  if (!Array.isArray(data.fonte)) {
    return;
  }
  const antes = [...data.fonte];
  data.fonte = data.fonte
    .map((url) => url.replace(/^\[\d+\]\s*/, "").trim())
    .filter((url) => url.length > 0);
  const corrigidas = antes.filter((url, i) => url !== data.fonte[i]);
  if (corrigidas.length) {
    erros.push(
      `[auto-corrigido] "fonte": removidos marcadores de citação de ${corrigidas.length} URL(s)`,
    );
  }
}

function validarFontes(data, erros, duvidas) {
  if (!Array.isArray(data.fonte) || data.fonte.length === 0) {
    erros.push('[aviso] "fonte": nenhuma fonte retornada');
    duvidas.push({
      campo: "fonte",
      pergunta: `Para as informações de visto de ${data._pais || "este país"} para brasileiros: quais as fontes oficiais (embaixada, consulado, site do governo)? Retorne JSON: { "fonte": string[] }`,
    });
    return;
  }

  const dominiosConfiaveis = [
    ".gov.",
    ".gov.br",
    ".gob.",
    ".gouv.",
    ".govt.",
    "embaixada",
    "embassy",
    "consulat",
    "embajada",
    "iata.org",
    "timatic",
    "mne.gov",
    "mofa.",
    "mfa.",
  ];

  const todasNaoConfiaveis = data.fonte.every((url) => {
    if (!url.startsWith("http")) {
      return true;
    }
    return !dominiosConfiaveis.some((d) => url.includes(d));
  });

  for (const url of data.fonte) {
    if (!url.startsWith("http")) {
      erros.push(`[aviso] "fonte": URL inválida — "${url}"`);
      continue;
    }
    const isConfiavel = dominiosConfiaveis.some((d) => url.includes(d));
    if (!isConfiavel) {
      erros.push(`[aviso] "fonte": domínio não reconhecido como oficial — "${url}"`);
    }
  }

  if (todasNaoConfiaveis) {
    duvidas.push({
      campo: "fonte",
      pergunta: `Para informações de visto de ${data._pais || "este país"} para brasileiros: busque fontes oficiais (embaixada, consulado, site do governo). Retorne JSON: { "fonte": string[] }`,
    });
  }
}

const DOMINIOS_OFICIAIS_RECURSOS = [
  ".gov.",
  ".gov.br",
  ".gob.",
  ".gouv.",
  ".govt.",
  "embaixada",
  "embassy",
  "consulat",
  "embajada",
  "iata.org",
  "timatic",
  "mne.gov",
  "mofa.",
  "mfa.",
];

function validarRecursos(data, erros) {
  if (!Array.isArray(data.recursos) || data.recursos.length === 0) {
    return;
  }

  for (const r of data.recursos) {
    if (!r.titulo) {
      erros.push('[aviso] "recursos": item sem "titulo"');
    }
    if (!r.url) {
      erros.push('[aviso] "recursos": item sem "url"');
      continue;
    }
    if (!r.url.startsWith("http")) {
      erros.push(`[aviso] "recursos": URL inválida — "${r.url}"`);
      continue;
    }
    if (!r.tipo) {
      erros.push('[aviso] "recursos": item sem "tipo"');
      continue;
    }

    // se marcado como oficial mas URL não é de domínio governamental, corrigir
    if (r.tipo === "oficial") {
      const isOficial = DOMINIOS_OFICIAIS_RECURSOS.some((d) => r.url.includes(d));
      if (!isOficial) {
        erros.push(
          `[auto-corrigido] "recursos": ${r.titulo} marcado como oficial mas URL não é governamental — rebaixado para artigo`,
        );
        r.tipo = "artigo";
      }
    }
  }
}

export function validar(data, pais = null) {
  const erros = [];
  const duvidas = [];

  if (pais) {
    data._pais = pais;
  }

  validarCamposObrigatorios(data, erros);
  corrigirBooleanos(data, erros);
  corrigirArrays(data, erros);
  validarConfiabilidade(data, erros);
  validarCoerenciaSemantica(data, erros, duvidas);
  validarData(data, erros);
  sanitizarFontes(data, erros);
  validarFontes(data, erros, duvidas);
  validarRecursos(data, erros);

  delete data._pais;

  const temErrosCriticos = erros.some((e) => e.startsWith("[erro]"));

  return {
    valido: !temErrosCriticos,
    erros,
    duvidas,
    data,
  };
}
