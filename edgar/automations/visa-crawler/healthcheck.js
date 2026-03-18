const TIMEOUT_MS = 5000;
const CONCORRENCIA = 5;

async function checarUrl(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; visa-crawler/1.0)" },
      redirect: "follow",
    });
    return { url, ok: response.ok, status: response.status };
  } catch (err) {
    const motivo = err.name === "AbortError" ? "timeout" : err.message;
    return { url, ok: false, status: null, motivo };
  } finally {
    clearTimeout(timeout);
  }
}

async function checarEmLotes(urls, concorrencia = CONCORRENCIA) {
  const resultados = [];
  for (let i = 0; i < urls.length; i += concorrencia) {
    const lote = urls.slice(i, i + concorrencia);
    const res = await Promise.all(lote.map(checarUrl));
    resultados.push(...res);
  }
  return resultados;
}

export async function healthcheck(data, erros) {
  const urls = (data.recursos ?? []).filter((r) => r.url?.startsWith("http")).map((r) => r.url);

  if (!urls.length) {
    return;
  }

  const resultados = await checarEmLotes(urls);

  for (const { url, ok, status, motivo } of resultados) {
    if (!ok) {
      const detalhe = motivo ?? `HTTP ${status}`;
      erros.push(`[aviso] "recursos": URL inacessível (${detalhe}) — "${url}"`);

      // remove o recurso com URL quebrada do array
      const idx = data.recursos.findIndex((r) => r.url === url);
      if (idx !== -1) {
        erros.push(
          `[auto-corrigido] "recursos": removido item com URL quebrada — "${data.recursos[idx].titulo}"`,
        );
        data.recursos.splice(idx, 1);
      }
    }
  }
}
