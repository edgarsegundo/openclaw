const CAMPOS_BOOLEANOS = ["entrevista", "seguroSaude", "comprovanteRetorno"];

const CAMPOS_ARRAY = ["documentos", "vacinas", "consulados", "fonte"];

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
  "documentos",
  "vacinas",
  "consulados",
  "observacoes",
  "fonte",
  "atualizadoEm",
];

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

function validarCoerenciaSemantica(data, erros) {
  const isento = data.typeLabel?.toLowerCase().includes("isento");

  if (isento) {
    if (data.entrevista === true) {
      erros.push('[aviso] "entrevista": true, mas typeLabel indica isenção de visto');
    }
    if (data.custo && data.custo !== null) {
      erros.push('[aviso] "custo": preenchido, mas typeLabel indica isenção de visto');
    }
  }

  if (data.entrevista === true && !data.consulados?.length) {
    erros.push(
      '[aviso] "entrevista": true, mas "consulados" está vazio — onde o viajante comparece?',
    );
  }

  if (data.consulados?.length) {
    for (const c of data.consulados) {
      if (!c.cidade) {
        erros.push('[aviso] "consulados": item sem "cidade"');
      }
      if (!c.site) {
        erros.push('[aviso] "consulados": item sem "site"');
      } else if (!c.site.startsWith("http")) {
        erros.push(`[aviso] "consulados": site inválido — "${c.site}"`);
      }
    }
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

function validarFontes(data, erros) {
  if (!Array.isArray(data.fonte) || data.fonte.length === 0) {
    erros.push('[aviso] "fonte": nenhuma fonte retornada');
    return;
  }

  const dominiosConfiaveis = [
    ".gov.",
    ".gov.br",
    "embaixada",
    "embassy",
    "consulat",
    "iata.org",
    "timatic",
    "mne.gov",
  ];

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
}

export function validar(data) {
  const erros = [];

  validarCamposObrigatorios(data, erros);
  corrigirBooleanos(data, erros);
  corrigirArrays(data, erros);
  validarCoerenciaSemantica(data, erros);
  validarData(data, erros);
  validarFontes(data, erros);

  const temErrosCriticos = erros.some((e) => e.startsWith("[erro]"));

  return {
    valido: !temErrosCriticos,
    erros,
    data,
  };
}
