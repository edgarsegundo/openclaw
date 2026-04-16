import path from "path";
import { exec } from "child_process";
import { fileURLToPath } from "url";
import { createTempInputFile } from "./common.js";
import fs from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  name: "/del",
  description: "Remove artigo pendente por índice",

  async execute({ message, args, botName }) {
    const index = args[0];
    if (!Number.isInteger(Number(args[0]))) {
      return message.reply("❌ Índice inválido. Use um número inteiro, por exemplo: /del 1");
    }
    try {
      const inputPath = path.resolve(
        __dirname,
        "../../../automations/cron-manager/tasks/rss-picker/inputs/inputs-visto-americano.json"
      );

      let inputObj = JSON.parse(await fs.readFile(inputPath, "utf-8"));
      inputObj.action = "del";
      inputObj.item_index = Number(index);

      const inputFile = createTempInputFile(inputObj, inputObj.action);
      const cmd =
        `node cron-manager.js run rss-picker --template feed-selector-visto-americano --input-file ${inputFile}`;
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

      await message.reply(`🗑️ Removido artigo ${index} da lista de pendentes`);
    } catch (err) {
      console.error(err);
      await message.reply("❌ Erro ao remover");
    }
  },
};
