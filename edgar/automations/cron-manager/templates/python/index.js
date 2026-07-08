/**
 * Task: {{NAME}} (Python runtime)
 *
 * This is a thin bridge. The cron-manager runner always imports index.js
 * in-process, so a Python task keeps this shim and puts the real logic in
 * main.py. runPython() spawns `uv run main.py`, passes the context as JSON on
 * stdin, forwards Python's stdout/stderr into the run log, and returns whatever
 * main.py emits via emit_result().
 *
 * The Node side keeps ownership of anything cron-manager-native (saveArtifact,
 * track/flow, and — if you need AI — runPrompt). Do that work here, after the
 * Python step returns.
 */
import { runPython } from "../../lib/py-bridge.js";

export default async function (context) {
  const { taskName, mode, executionId, inputs, saveArtifact } = context;

  const result = await runPython(import.meta.dirname, {
    taskName,
    mode,
    executionId,
    inputs,
  });

  // main.py emitted a result via emit_result(...) → persist it as an artifact.
  // Remove this if your Python step has no structured output to save.
  if (result != null) {
    await saveArtifact("result", result);
  }

  console.log("Done!");
}
