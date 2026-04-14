// edgar/channels/discord/commands/createTempInputFile.js
import path from "path";
import fs from "fs";
import os from "os";

export function createTempInputFile(itemIndex, action = "approve") {
  const inputObj = {
    rss_fetcher_output_artifact_file_name_pattern: "artifacts/rss-fetcher/rss-artifact-visto-americano-{date}.json",
    blog_context: "Blog voltado para brasileiros interessados em assuntos ligados ao visto americano e aos serviços consulares dos EUA. O público busca informações práticas, atualizadas e confiáveis sobre solicitação, renovação, entrevistas, documentação, mudanças nas regras, notícias do consulado e outros temas relacionados ao processo consular.",
    min_items: 3,
    min_score: 7,
    action, // "approve" ou "del"
    item_index: itemIndex
  };
  const tmpPath = path.join(os.tmpdir(), `inputs-tmp-pub-${Date.now()}.json`);
  fs.writeFileSync(tmpPath, JSON.stringify(inputObj, null, 2), "utf-8");
  return tmpPath;
}
