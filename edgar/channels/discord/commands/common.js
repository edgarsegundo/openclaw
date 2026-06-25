import path from "path";
import fs from "fs";
import os from "os";

export function createTempInputFile(inputObj, action) {
  const tmpPath = path.join(os.tmpdir(), `inputs--${action}-${Date.now()}.json`);
  fs.writeFileSync(tmpPath, JSON.stringify(inputObj, null, 2), "utf-8");
  return tmpPath;
}

/**
 * Best-effort removal of a temp input file created by createTempInputFile.
 * Safe to call unconditionally (ignores a missing file).
 */
export function removeTempInputFile(tmpPath) {
  if (!tmpPath) return;
  try {
    fs.rmSync(tmpPath, { force: true });
  } catch {
    // ignore — temp file cleanup must never throw
  }
}
