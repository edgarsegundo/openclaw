export default async function (context) {
  const { inputs, runPrompt, saveArtifact } = context;

  console.log(`Analyzing word: "${inputs.word}" [${inputs.language}]`);

  const { artifact: a } = await runPrompt();

  console.log(`\nWord:        ${a.word}`);
  console.log(`Part:        ${a.part_of_speech}`);
  console.log(`Definition:  ${a.definition}`);
  console.log(`Synonyms:    ${a.synonyms.join(", ")}`);
  console.log(`Antonyms:    ${a.antonyms.length ? a.antonyms.join(", ") : "(none)"}`);
  console.log(`\nExample: "${a.example_sentence}"`);

  await saveArtifact("analysis", a);

  console.log("\nDone!");
}

// ## O que acontece hoje

// `runPrompt()` retorna o JSON validado mas **não salva nada automaticamente**. Salvar é sempre uma ação explícita:

// ```js
// const { artifact } = await runPrompt();  // ← só retorna, não salva
// await saveArtifact("analysis", artifact); // ← você decide quando/como salvar
// ```

// O `saveArtifact` do runner escreve em `artifacts/word-insight/analysis.json`.

// ---

// ## Você já tem controle total no index.js

// Como o index.js recebe o `artifact` antes de salvar, você pode fazer qualquer coisa:

// **Manipular antes de salvar:**
// ```js
// const { artifact } = await runPrompt();

// // enriquecer, filtrar, transformar...
// const enriched = {
//   ...artifact,
//   analyzed_at: new Date().toISOString(),
//   word_count: artifact.definition.split(" ").length,
// };

// await saveArtifact("analysis", enriched);
// ```

// **Salvar em múltiplos formatos:**
// ```js
// const { artifact } = await runPrompt();

// await saveArtifact("analysis", artifact);          // JSON via runner
// await fs.writeFile("output.md", artifact.content); // arquivo custom
// ```

// **Não salvar artifact algum** (só logar, enviar para uma API, etc.):
// ```js
// const { artifact } = await runPrompt();
// await sendToExternalApi(artifact);  // sem saveArtifact
// ```

// **Salvar arquivo raw sem usar `saveArtifact`:**
// ```js
// import fs from "fs";
// const { artifact } = await runPrompt();
// fs.writeFileSync("./meu-arquivo.md", artifact.content);
// ```

// ---

// ## Resumo
