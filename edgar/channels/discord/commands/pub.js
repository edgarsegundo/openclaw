import path from "path";
import { exec } from "child_process";
import { fileURLToPath } from "url";
import { createTempInputFile } from "./common.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  name: "/pub",
  description: "Publica artigo por índice",

  async execute({ message, args, botName }) {
    const index = args[0];
    if (!Number.isInteger(Number(args[0]))) {
      return message.reply("❌ Índice inválido. Use um número inteiro, por exemplo: /pub 1");
    }    
    try {
      const inputFile = createTempInputFile(Number(index), "pub");
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
