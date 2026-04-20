import path from "path";
import { exec } from "child_process";
import { fileURLToPath } from "url";
import { createTempInputFile } from "./common.js";
import fs from "fs/promises";
import FEED_SHORTCODES from "../../cron-manager/tasks/rss-fetcher/shortcodes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  name: ".l1",
  description: "Lista artigos por índice",

  async execute({ message, args, botName }) {
    const shortcode = args[0];
    const feedName = FEED_SHORTCODES[shortcode];
    if (!feedName) {
      return message.reply(
        `❌ Shortcode inválido. Use um dos seguintes: ${Object.keys(FEED_SHORTCODES).join(", ")}`
      );
    }
    await message.reply(`✅ Listando artigos`);
    try {
      const inputPath = path.resolve(
        __dirname,
        `../../../automations/cron-manager/tasks/rss-picker/inputs/inputs-${feedName}.json`
      );

      let inputObj = JSON.parse(await fs.readFile(inputPath, "utf-8"));
      inputObj.action = "l1";

      const inputFile = createTempInputFile(inputObj, inputObj.action);
      const cmd =
        `node cron-manager.js run rss-picker --template skip --input-file ${inputFile}`;
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
    } catch (err) {
      console.error(err);
      await message.reply("❌ Erro ao listar os artigos. Verifique os logs para mais detalhes.");
    }
  },
};
