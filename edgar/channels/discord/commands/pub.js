import path from "path";
import { exec } from "child_process";
import { fileURLToPath } from "url";
import { createTempInputFile } from "./common.js";
import fs from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  name: ".pub",
  description: "Publica artigo por índice",

  async execute({ message, args, botName }) {
    const index = args[0];
    if (!Number.isInteger(Number(args[0]))) {
      return message.reply("❌ Índice inválido. Use um número inteiro, por exemplo: .pub 1");
    }

    const channelId = message.channel.id;
    const channelName = message.channel.name;

    await message.reply(`⏳ Publicando artigo ${index}...`);
    try {
      const inputPath = path.resolve(
        __dirname,
        `../../../automations/cron-manager/tasks/publish-article/inputs/inputs-${channelName}.json`
      );

      let inputObj = JSON.parse(await fs.readFile(inputPath, "utf-8"));
      inputObj.action = "pub";
      inputObj.item_index = Number(index);

      const inputFile = createTempInputFile(inputObj, inputObj.action);
      const cmd =
        `node cron-manager.js run publish-article --template skip --input-file ${inputFile}`;
      const cwd = path.resolve(
        __dirname,
        "../../../automations/cron-manager"
      );      

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

      console.log(`✅ Artigo ${index} publicado com sucesso.`);
    } catch (err) {
      console.error(err);
      await message.reply("❌ Erro ao publicar o artigo. Verifique os logs para mais detalhes.");
    }
  },
};
