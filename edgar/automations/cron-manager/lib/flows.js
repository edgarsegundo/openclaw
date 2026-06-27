/**
 * Canonical per-task execution flows ("o desenho do fluxo").
 *
 * Single source of truth shared by:
 *   - the tasks (which emit one `flow.<key>` checkpoint per phase via context.flow),
 *   - the dashboard (which draws the diagram + colors each node by what actually
 *     happened in a given execution).
 *
 * Each task declares an ORDERED list of the fundamental pieces of its pipeline.
 * The `key` must match exactly what the task emits with `context.flow(key, …)`.
 * `label` is the human caption shown in the diagram box; `desc` is an optional
 * one-line hint surfaced in the detailed list when no live event exists.
 *
 * These describe the MAIN path of each task. Manual-command variants (.apr/.del,
 * .pub, list) emit their own checkpoints too — they simply won't light up every
 * node of the canonical diagram, which is expected.
 */
export const FLOWS = {
  "rss-fetcher": {
    emoji: "📡",
    label: "RSS Fetcher",
    steps: [
      {
        key: "resolve_feeds",
        label: "Resolver feeds",
        desc: "Monta a lista de feeds (custom ou padrão, filtrando por idioma/categoria).",
      },
      {
        key: "fetch_feeds",
        label: "Buscar feeds",
        desc: "Percorre cada feed (RSS/scraper), pontua e filtra por relevância e data.",
      },
      {
        key: "dedup",
        label: "Deduplicar",
        desc: "Remove duplicados da execução por fingerprint de título (Jaccard).",
      },
      {
        key: "rank_select",
        label: "Ranquear/Selecionar",
        desc: "Ordena por score+data e corta em max_items.",
      },
      {
        key: "save_artifact",
        label: "Salvar artifact",
        desc: "Mescla com o artifact do dia e grava os itens novos.",
      },
      {
        key: "update_history",
        label: "Atualizar histórico",
        desc: "Acrescenta os fingerprints ao seen-hashes.",
      },
      { key: "cleanup", label: "Limpar antigos", desc: "Apaga artifacts com mais de 7 dias." },
    ],
  },

  "rss-picker": {
    emoji: "🎯",
    label: "RSS Picker",
    steps: [
      {
        key: "load_input",
        label: "Ler fetcher",
        desc: "Carrega o artifact do dia do rss-fetcher (tolera virada de meia-noite).",
      },
      {
        key: "load_status",
        label: "Ler status",
        desc: "Carrega o status do dia (itens já resolvidos / já enviados).",
      },
      {
        key: "filter_unresolved",
        label: "Filtrar novos",
        desc: "Mantém só os itens ainda não resolvidos.",
      },
      {
        key: "threshold_check",
        label: "Checar mínimo",
        desc: "Se < min_items, notifica o Discord e encerra (aprovação manual).",
      },
      { key: "dedup", label: "Deduplicar", desc: "Remove duplicados por URL real antes da IA." },
      {
        key: "ai_triage",
        label: "Triagem IA",
        desc: "Envia os itens à IA (Perplexity Sonar) para pontuar.",
      },
      { key: "approve", label: "Aprovar", desc: "Aprova os itens com score >= min_score." },
      {
        key: "save_approved",
        label: "Salvar aprovados",
        desc: "Acrescenta os aprovados ao arquivo diário e atualiza o status.",
      },
      { key: "cleanup", label: "Limpar antigos", desc: "Apaga arquivos com mais de 7 dias." },
    ],
  },

  "write-article": {
    emoji: "✍️",
    label: "Write Article",
    steps: [
      {
        key: "resolve_list",
        label: "Resolver lista",
        desc: "Resolve o arquivo de aprovados do dia (tolera virada de meia-noite).",
      },
      {
        key: "load_articles",
        label: "Ler artigos",
        desc: "Faz parse da lista de artigos aprovados.",
      },
      {
        key: "read_index",
        label: "Ler índice",
        desc: "Lê o índice de progresso (qual artigo processar).",
      },
      {
        key: "select_article",
        label: "Selecionar artigo",
        desc: "Escolhe o artigo na posição do índice.",
      },
      {
        key: "generate",
        label: "Gerar (IA)",
        desc: "Pesquisa e escreve o artigo via Perplexity Sonar Pro.",
      },
      { key: "enrich", label: "Enriquecer", desc: "Aplica as transformações do enrichArticle()." },
      {
        key: "save_artifact",
        label: "Salvar artifact",
        desc: "Grava o JSON e o Markdown no output_dir.",
      },
      {
        key: "advance_index",
        label: "Avançar índice",
        desc: "Grava o índice +1 só após salvar (anti-repetição).",
      },
    ],
  },

  "publish-article": {
    emoji: "🚀",
    label: "Publish Article",
    steps: [
      {
        key: "scan_articles",
        label: "Buscar artigo",
        desc: "Acha o JSON de artigo mais antigo ainda não publicado.",
      },
      {
        key: "load_article",
        label: "Carregar artigo",
        desc: "Lê o JSON e o Markdown correspondente.",
      },
      {
        key: "idempotency_check",
        label: "Anti-duplicata",
        desc: "Pula se o item já foi publicado com sucesso antes.",
      },
      {
        key: "validate_fields",
        label: "Validar campos",
        desc: "Garante title, seoMetaDescription e slug.",
      },
      {
        key: "resolve_destination",
        label: "Escolher destino",
        desc: "Seleciona o destino por round-robin e persiste o estado.",
      },
      {
        key: "post_cms",
        label: "Publicar no CMS",
        desc: "Monta o payload e faz POST para o endpoint de publicação.",
      },
      {
        key: "move_published",
        label: "Mover p/ published",
        desc: "Move JSON+MD para published/ com a data no nome.",
      },
      {
        key: "register_status",
        label: "Registrar status",
        desc: "Registra o artigo no status do dia.",
      },
      { key: "notify", label: "Notificar Discord", desc: "Envia a lista do dia para o Discord." },
      { key: "cleanup", label: "Limpar antigos", desc: "Apaga arquivos com mais de 7 dias." },
    ],
  },
};

/**
 * Look up a flow definition by task name. Returns null for unknown tasks so the
 * dashboard can fall back to a plain (diagram-less) event timeline.
 */
export function getFlow(taskName) {
  return FLOWS[taskName] ?? null;
}
