import path from "path";
import { exec } from "child_process";
import { createTempInputFile } from "./common.js";

export default {
  name: "/del",
  description: "Remove artigo pendente por índice",

  async execute({ message, args, botName }) {
    const index = args[0];
    if (index !== "0" && index !== "1") {
      return message.reply("❌ Índice inválido. Use /del 0 ou /del 1");
    }
    try {
      const inputFile = createTempInputFile(Number(index), "del");
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
