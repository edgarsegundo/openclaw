
import { exec } from "child_process";
import { readFile, writeFile } from "fs/promises";
import path from "path";

export default {
  name: "/pub",
  description: "Publica artigo por índice",

  async execute({ message, args, botName }) {
    const index = args[0];
    if (index !== "0" && index !== "1") {
      return message.reply("❌ Índice inválido. Use /pub 0 ou /pub 1");
    }
    try {
      // Seleciona o arquivo de input conforme o índice
      const inputFile =
        index === "0"
          ? "tasks/rss-picker/inputs/inputs-visto-americano-force-idx-0.json"
          : "tasks/rss-picker/inputs/inputs-visto-americano-force-idx-1.json";

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

      await message.reply(`✅ Publicando artigo ${index}`);
    } catch (err) {
      console.error(err);
      await message.reply("❌ Erro ao publicar");
    }
  },
};
