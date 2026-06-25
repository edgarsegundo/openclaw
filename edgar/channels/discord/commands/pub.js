import path from "path";
import { exec } from "child_process";
import { fileURLToPath } from "url";
import { createTempInputFile, removeTempInputFile } from "./common.js";
import fs from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  name: ".pub",
  description: "Publica artigo por site_id (ex: .pub fastvistos) ou por índice (ex: .pub 1)",

  async execute({ message, args, botName }) {
    const arg = args[0];
    if (!arg) {
      return message.reply("❌ Argumento obrigatório. Use `.pub <site_id>` ou `.pub <índice>`.");
    }

    const isIndex = Number.isInteger(Number(arg));
    const channelName = message.channel.name;

    await message.reply(
      isIndex ? `⏳ Publicando artigo ${arg}...` : `⏳ Publicando artigos do site '${arg}'...`,
    );

    try {
      const inputPath = path.resolve(
        __dirname,
        `../../../automations/cron-manager/tasks/publish-article/inputs/inputs-${channelName}.json`,
      );

      let inputObj = JSON.parse(await fs.readFile(inputPath, "utf-8"));
      inputObj.action = "pub";

      if (isIndex) {
        inputObj.item_index = Number(arg);
        delete inputObj.site_id;
      } else {
        inputObj.site_id = arg;
        delete inputObj.item_index;
      }

      const inputFile = createTempInputFile(inputObj, inputObj.action);
      const cmd = `node cron-manager.js run publish-article --template skip --input-file ${inputFile}`;
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

      console.log(`✅ Comando .pub ${arg} executado com sucesso.`);
    } catch (err) {
      console.error(err);
      await message.reply("❌ Erro ao publicar. Verifique os logs para mais detalhes.");
    }
  },
};
