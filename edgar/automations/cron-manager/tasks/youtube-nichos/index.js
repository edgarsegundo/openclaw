/**
 * Task: youtube-nichos (Python runtime)
 *
 * Thin bridge — the runner imports this in-process, then we hand control to
 * main.py via `uv run`. The Python side does the YouTube API work and emits a
 * structured result; here we persist it as an artifact.
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

  if (result != null) {
    await saveArtifact("result", result);
  }

  console.log("Done!");
}
