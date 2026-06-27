# rss-picker — How it works

Lê o artifact do dia do rss-fetcher e decide entre dois caminhos:
**IA** (quando há itens novos suficientes → triagem por score) ou **humano**
(quando há poucos → notifica o Discord e espera aprovação manual `.apr`/`.del`).
O estado do dia fica em `status-<group>-<YYYY-MM-DD>.json`.

## Diagrama do fluxo (caminho normal / IA)

```
[load_input] → [load_status] → [filter_unresolved] → [threshold_check] → [dedup] → [ai_triage] → [approve] → [save_approved] → [cleanup]
```

Cada caixa é um _checkpoint_ (`flow.*`) ligado ao `execution_id`. No dashboard,
clique na linha da execução para ver o diagrama colorido por status. Execuções de
comando manual acendem checkpoints extras (`manual_approve`, `manual_delete`,
`list`) em vez do caminho de IA — isso é esperado.

## Passo a passo (código real)

1. **load_input** — Resolve o arquivo do rss-fetcher
   (`fetched-items-<group>-<date>.json`), tolerando a virada de meia-noite (tenta
   hoje, cai para ontem). Se não existir, `skipped` (reason `fetcher_file_missing`).
   - meta: `total_items`, `topic`, `date`.
2. **load_status** — Carrega o status do dia: `resolvedSet` (já aprovados/deletados)
   e `sentSet` (já enviados ao Discord).
   - meta: `resolved`, `sent`.
   - **Comandos manuais** (interceptados aqui, antes do caminho normal):
     - `l1` → envia a lista completa ao Discord (`flow.list`).
     - `.apr N` → aprova o item N direto (sem IA), grava no approved (`flow.manual_approve`).
     - `.del N` → marca N como deletado (`flow.manual_delete`).
3. **filter_unresolved** — Mantém só os itens ainda não resolvidos (anexando o
   `fetcherIndex` original).
   - meta: `unresolved`, `resolved`.
4. **threshold_check** — Compara `unresolved` com `min_items` (default 3). Se
   abaixo: envia ao Discord só os itens **novos** (ainda não enviados) e encerra
   (`skipped`, reason `below_min_items`). Se atinge: segue para a IA.
   - meta: `unresolved`, `min_items`.
5. **dedup** — Remove duplicados por URL real (desfaz redirect do Google Alerts).
   - meta: `before`, `after`, `removed`.
6. **ai_triage** — Envia os itens deduplicados à IA (Perplexity Sonar via
   `runPrompt`) para pontuar cada um.
   - meta: `evaluated`, `cost_usd`.
7. **approve** — Aprova os itens com `score >= min_score` (default 7); o resto é
   rejeitado. Todos os avaliados são marcados como resolvidos no status (não
   voltam à IA nem ao Discord). Eventos item-level `pick/ok|skipped` são gravados.
   - meta: `evaluated`, `approved`, `min_score`.
8. **save_approved** — Acrescenta os aprovados a `approved-<group>-<date>.json`
   (sem duplicar links) e persiste o status atualizado.
   - meta: `saved`, `approved`.
9. **cleanup** — Apaga `approved-*`/`status-*` com mais de 7 dias.
   - meta: `deleted`.

---

**Resumo dos fluxos**

- **Normal (IA):** só roda IA se houver `>= min_items` novos; aprova por score.
- **Abaixo do mínimo:** notifica o Discord com os novos e espera comando manual.
- **`force: true`:** ignora o mínimo, segue o fluxo de IA.
- **`.apr`/`.del N`:** resolve só o item escolhido, sem IA. Índice 0-based (fetcher).

Próxima etapa: **write-article** com o `approved-<group>-<date>.json`.
