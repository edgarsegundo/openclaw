import path from "path";
import { exec } from "child_process";
import { fileURLToPath } from "url";
import { createTempInputFile, removeTempInputFile } from "./common.js";
import fs from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  name: ".apr",
  description: "Aprova artigo por índice",

  async execute({ message, args, botName }) {
    const channelId = message.channel.id;
    const channelName = message.channel.name;

    const index = args[0];
    if (!Number.isInteger(Number(args[0]))) {
      return message.reply("❌ Índice inválido. Use um número inteiro, por exemplo: .apr 1");
    }

    try {
      const inputPath = path.resolve(
        __dirname,
        `../../../automations/cron-manager/tasks/rss-picker/inputs/inputs-${channelName}.json`,
      );

      let inputObj = JSON.parse(await fs.readFile(inputPath, "utf-8"));
      inputObj.action = "apr";
      inputObj.item_index = Number(index);

      const inputFile = createTempInputFile(inputObj, inputObj.action);
      const cmd = `node cron-manager.js run rss-picker --template feed-selector-news-related --input-file ${inputFile}`;
      const cwd = path.resolve(__dirname, "../../../automations/cron-manager");

      try {
        await new Promise((resolve, reject) => {
          exec(cmd, { cwd }, (error, stdout, stderr) => {
            if (error) {
              console.error(stderr);
              reject(error);
            } else {
              console.log(stdout);
              resolve();
            }
          });
        });
      } finally {
        removeTempInputFile(inputFile);
      }

      await message.reply(`✅ Artigo ${index} aprovado com sucesso!`);
    } catch (err) {
      console.error(err);
      await message.reply("❌ Erro ao aprovar o artigo. Verifique os logs para mais detalhes.");
    }
  },
};
