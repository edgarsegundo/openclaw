import path from "path";
import { exec } from "child_process";
import { fileURLToPath } from "url";
import { createTempInputFile } from "./common.js";
import fs from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  name: "list",
  description: "Lista artigos por índice",

  async execute({ message, args, botName }) {
    try {
      const inputPath = path.resolve(
        __dirname,
        "../../../automations/cron-manager/tasks/publish-article/inputs/inputs-visto-americano.json"
      );

      let inputObj = JSON.parse(await fs.readFile(inputPath, "utf-8"));
      inputObj.action = "list";

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

      await message.reply(`✅ Listando artigos`);
    } catch (err) {
      console.error(err);
      await message.reply("❌ Erro ao listar os artigos. Verifique os logs para mais detalhes.");
    }
  },
};
