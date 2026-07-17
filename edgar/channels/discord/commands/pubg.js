import path from "path";
import { exec } from "child_process";
import { fileURLToPath } from "url";
import { createTempInputFile, removeTempInputFile } from "./common.js";
import fs from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  name: ".pub*",
  description: "Publica artigos de um site_id em TODOS os grupos (ex: .pub* fastvistos)",

  async execute({ message, args, botName }) {
    const siteId = args[0];
    if (!siteId) {
      return message.reply(
        "❌ Argumento obrigatório. Use `.pub* <site_id>` (ex: `.pub* fastvistos`).",
      );
    }

    await message.reply(`⏳ Buscando e publicando todos os artigos de '${siteId}'...`);

    try {
      const inputsDir = path.resolve(
        __dirname,
        `../../../automations/cron-manager/tasks/publish-article/inputs`,
      );

      // Lê todos os arquivos de input
      const files = await fs.readdir(inputsDir);
      const inputFiles = files.filter((f) => f.startsWith("inputs-") && f.endsWith(".json"));

      // Filtra arquivos que contêm o site_id desejado
      const matchingFiles = [];
      for (const file of inputFiles) {
        const filePath = path.join(inputsDir, file);
        try {
          const content = JSON.parse(await fs.readFile(filePath, "utf-8"));
          const hasTargetSiteId = content.destinations?.some((d) => d.site_id === siteId);
          if (hasTargetSiteId) {
            matchingFiles.push({ file, group: content.group });
          }
        } catch (err) {
          console.error(`Erro ao ler ${file}:`, err.message);
        }
      }

      if (matchingFiles.length === 0) {
        return message.reply(
          `❌ Nenhum grupo encontrado com o site_id '${siteId}'. Verifique o nome.`,
        );
      }

      // Executa publish-article para cada grupo encontrado
      const results = [];
      for (const { file, group } of matchingFiles) {
        const filePath = path.join(inputsDir, file);
        let inputObj = JSON.parse(await fs.readFile(filePath, "utf-8"));
        inputObj.action = "pub";
        inputObj.site_id = siteId;

        const inputFile = createTempInputFile(inputObj, `pubg-${siteId}`);
        const cmd = `node cron-manager.js run publish-article --template skip --input-file ${inputFile}`;
        const cwd = path.resolve(__dirname, "../../../automations/cron-manager");

        try {
          console.log(`📢 Publicando grupo '${group}' para '${siteId}'...`);
          await new Promise((resolve, reject) => {
            exec(cmd, { cwd }, (error, stdout, stderr) => {
              if (stdout) console.log(stdout);
              if (stderr) console.error(stderr);
              if (error) reject(error);
              else resolve();
            });
          });
          results.push({ group, status: "✅" });
        } catch (err) {
          console.error(`Erro ao publicar grupo '${group}':`, err.message);
          results.push({ group, status: "❌" });
        } finally {
          removeTempInputFile(inputFile);
        }
      }

      // Monta resumo dos resultados
      const summary = results.map((r) => `${r.status} ${r.group}`).join("\n");
      const successCount = results.filter((r) => r.status === "✅").length;

      await message.reply(
        `**Publicação Global Concluída**\n\`\`\`\n${summary}\n\`\`\`\n` +
          `✅ ${successCount}/${results.length} grupo(s) processado(s) com sucesso.`,
      );

      console.log(`✅ Comando .pub* ${siteId} executado com sucesso.`);
    } catch (err) {
      console.error(err);
      await message.reply(
        "❌ Erro ao executar publicação global. Verifique os logs para mais detalhes.",
      );
    }
  },
};
