import path from "path";
import { exec } from "child_process";
import { fileURLToPath } from "url";
import { createTempInputFile } from "./common.js";
import fs from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  name: ".l1",
  description: "Lista artigos por índice",

  async execute({ message, args, botName }) {
    await message.reply(`✅ Listando artigos`);
    const channelId = message.channel.id;
    const channelName = message.channel.name;

    console.log(`.l1 command executed by ${message.author.tag} in channel ${channelName} (${channelId}) with botName: ${botName}`); 

    try {

      console.log(`Executing .l1 with botName: ${botName}`);
      const inputPath = path.resolve(
        __dirname,
        "../../../automations/cron-manager/tasks/rss-picker/inputs/inputs-visto-americano.json"
      );

      let inputObj = JSON.parse(await fs.readFile(inputPath, "utf-8"));
      inputObj.action = "l1";
      inputObj.botName = botName;

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
