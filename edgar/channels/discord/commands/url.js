import path from "path";
import { exec } from "child_process";
import { fileURLToPath } from "url";
import { createTempInputFile, removeTempInputFile } from "./common.js";
import fs from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  name: ".url",
  description:
    "Registra uma URL de notícia direto nos aprovados (como .apr, porém por URL). Uso: .url <url> [título opcional]",

  async execute({ message, args, botName }) {
    const channelName = message.channel.name;

    const url = (args[0] || "").trim();
    // Título é opcional: tudo depois da URL. Se vazio, a task busca o og:title/<title>.
    const title = args.slice(1).join(" ").trim();

    // Validação: precisa ser uma URL http(s) válida.
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return message.reply("❌ URL inválida. Uso: `.url <url> [título opcional]`");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return message.reply("❌ A URL precisa começar com http:// ou https://");
    }

    await message.reply("⏳ Registrando URL para escrita...");

    try {
      const inputPath = path.resolve(
        __dirname,
        `../../../automations/cron-manager/tasks/rss-picker/inputs/inputs-${channelName}.json`,
      );

      let inputObj = JSON.parse(await fs.readFile(inputPath, "utf-8"));
      inputObj.action = "url";
      inputObj.url = url;
      if (title) {
        inputObj.title = title;
      }

      const inputFile = createTempInputFile(inputObj, inputObj.action);
      const cmd = `node cron-manager.js run rss-picker --template feed-selector-news-related --input-file ${inputFile}`;
      const cwd = path.resolve(__dirname, "../../../automations/cron-manager");

      try {
        await new Promise((resolve, reject) => {
          exec(cmd, { cwd }, (error, stdout, stderr) => {
            if (stdout) console.log(stdout);
            if (stderr) console.error(stderr);
            if (error) reject(error);
            else resolve();
          });
        });
      } finally {
        removeTempInputFile(inputFile);
      }

      await message.reply(
        "✅ URL registrada. O write-article vai gerar o artigo no próximo ciclo.",
      );
    } catch (err) {
      console.error(err);
      await message.reply("❌ Erro ao registrar a URL. Verifique os logs para mais detalhes.");
    }
  },
};
