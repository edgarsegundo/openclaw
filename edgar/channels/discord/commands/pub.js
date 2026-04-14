import path from "path";
import fs from "fs";
import os from "os";
import { exec } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  name: "/pub",
  description: "Publica artigo por índice",

  async execute({ message, args, botName }) {
    const index = args[0];
    if (index !== "0" && index !== "1") {
      return message.reply("❌ Índice inválido. Use /pub 0 ou /pub 1");
    }
    try {
      const inputFile = createTempInputFile(Number(index));
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

function createTempInputFile(itemIndex) {
  const inputObj = {
    rss_fetcher_output_artifact_file_name_pattern: "artifacts/rss-fetcher/rss-artifact-visto-americano-{date}.json",
    blog_context: "Blog voltado para brasileiros interessados em assuntos ligados ao visto americano e aos serviços consulares dos EUA. O público busca informações práticas, atualizadas e confiáveis sobre solicitação, renovação, entrevistas, documentação, mudanças nas regras, notícias do consulado e outros temas relacionados ao processo consular.",
    min_items: 3,
    min_score: 7,
    force: true,
    item_index: itemIndex
  };
  const tmpPath = path.join(os.tmpdir(), `inputs-tmp-pub-${Date.now()}.json`);
  fs.writeFileSync(tmpPath, JSON.stringify(inputObj, null, 2), "utf-8");
  return tmpPath;
}
