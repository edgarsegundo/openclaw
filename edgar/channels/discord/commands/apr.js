import path from "path";
import { exec } from "child_process";
import { fileURLToPath } from "url";
import { createTempInputFile, removeTempInputFile } from "./common.js";
import fs from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Approves a single item index by spawning one rss-picker run.
 * Indices are approved sequentially (never in parallel) because each run
 * does a read-modify-write on the same status/approved files for the day —
 * concurrent runs would race and lose each other's writes.
 */
async function approveIndex(baseInputObj, index) {
  const inputObj = { ...baseInputObj, action: "apr", item_index: index };
  const inputFile = createTempInputFile(inputObj, inputObj.action);
  const cmd = `node cron-manager.js run rss-picker --template feed-selector-news-related --input-file ${inputFile}`;
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
}

export default {
  name: ".apr",
  description: "Aprova um ou mais artigos por índice, ex: .apr 1 ou .apr 0 1 8",

  async execute({ message, args, botName }) {
    const channelName = message.channel.name;

    const tokens = args.filter((a) => a !== "");
    if (tokens.length === 0 || !tokens.every((a) => Number.isInteger(Number(a)))) {
      return message.reply(
        "❌ Índice inválido. Use um ou mais números inteiros, por exemplo: .apr 1 ou .apr 0 1 8",
      );
    }
    const indices = tokens.map(Number);

    try {
      const inputPath = path.resolve(
        __dirname,
        `../../../automations/cron-manager/tasks/rss-picker/inputs/inputs-${channelName}.json`,
      );
      const baseInputObj = JSON.parse(await fs.readFile(inputPath, "utf-8"));

      const approved = [];
      const failed = [];
      for (const index of indices) {
        try {
          await approveIndex(baseInputObj, index);
          approved.push(index);
        } catch (err) {
          console.error(err);
          failed.push(index);
        }
      }

      if (approved.length > 0) {
        await message.reply(`✅ Artigo(s) aprovado(s) com sucesso: ${approved.join(", ")}`);
      }
      if (failed.length > 0) {
        await message.reply(
          `❌ Erro ao aprovar artigo(s): ${failed.join(", ")}. Verifique os logs para mais detalhes.`,
        );
      }
    } catch (err) {
      console.error(err);
      await message.reply("❌ Erro ao aprovar o artigo. Verifique os logs para mais detalhes.");
    }
  },
};
