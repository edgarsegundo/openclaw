/**
 * Task: oferecer-seguro
 *
 * Entry point for your task. Receives a `context` object with everything needed:
 * inputs, env vars, AI prompt runner, and artifact saving.
 *
 * ─── context properties ────────────────────────────────────────────────────
 *   taskName     — string, name of this task
 *   mode         — "manual" | "cron"
 *   executionId  — unique UUID for this run (useful for dynamic artifact names)
 *   inputs       — values declared in task.config.yaml inputs[]
 *                  e.g. context.inputs.topic
 *   env          — env vars declared in task.config.yaml env_vars{}
 *                  e.g. context.env.MY_API_KEY
 *   runPrompt    — async fn — only available when --template was selected (see below)
 *   saveArtifact — fn(name, data) — writes JSON to artifacts/oferecer-seguro/<name>.json
 */
import { openDb } from "./db.js";
import { notifyDiscord } from "../../lib/discord.js";

export default async function (context) {
  const db = openDb();

  try {
    const diasJanela = context.inputs.dias_janela || 14;
    const rows = db.prepare(
      `
      SELECT id, nome, sobrenome, telefone, data_viagem, idade
      FROM notificacoes_seguros
      WHERE data_notificacao IS NULL
        AND data_viagem >= date('now')
        AND data_viagem <= date('now', ?)
      `
    ).all(`+${diasJanela} days`);

    if (rows.length === 0) {
      console.log("Nenhum cliente novo para notificar.");
      return;
    }

    for (const c of rows) {
      const nome = c.nome || "(Sem nome)";
      const primeiro = (nome || "").trim().split(" ")[0] || "";

      const primeiroNome =
        primeiro.charAt(0).toUpperCase() +
        primeiro.slice(1).toLowerCase();

      const sobrenome = c.sobrenome ? ` ${c.sobrenome}` : "";
      const idade = c.idade ? `, ${c.idade} anos` : "";
      const dataViagemFmt = c.data_viagem.split("-").reverse().join("/");
      const tel = c.telefone.replace(/[^0-9]/g, "");
      const waLink = `https://wa.me/55${tel}?text=${encodeURIComponent(
`Oi ${primeiroNome}! Tudo bem?

Vi aqui que sua viagem já está chegando.

Se ainda não fez o seguro viagem, posso te ajudar com uma cotação com desconto.

Se quiser, me avisa!`
      )}`;

      const msg =
        `Lembrete: Entrar em contato com ${nome}${sobrenome} ${idade} - viagem em ${dataViagemFmt} (whats: ${tel}).\n` +
        `👉 [Abrir WhatsApp Business](${waLink})`;

      try {
        // Envia lembrete para o Discord
        await notifyDiscord(msg);

        // Marca como notificado apenas se o envio foi bem-sucedido
        db.prepare(
          `UPDATE notificacoes_seguros
           SET data_notificacao = datetime('now', 'localtime')
           WHERE id = ?`
        ).run(c.id);

        console.log(`[OK] Notificado: ${nome} (${tel}) - ${c.data_viagem}`);
      } catch (discordErr) {
        // Fallback: registra falha no log sem interromper os demais clientes
        console.error(
          `[ERRO] Falha ao notificar ${nome} (${tel}) via Discord: ${discordErr.message}`
        );
      }
    }

    // // Limpeza opcional: remove registros de viagens já passadas e notificadas
    // const deleted = db
    //   .prepare(
    //     `DELETE FROM notificacoes_seguros
    //      WHERE data_viagem < date('now')
    //        AND data_notificacao IS NOT NULL`
    //   )
    //   .run();

    // if (deleted.changes > 0) {
    //   console.log(`[LIMPEZA] ${deleted.changes} registro(s) antigo(s) removido(s).`);
    // }
  } finally {
    db.close();
  }
}
