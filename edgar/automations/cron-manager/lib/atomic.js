import fs from "fs";
import fsp from "fs/promises";

/**
 * Write a file atomically: write to a temp sibling then rename over the target.
 * rename(2) is atomic on the same filesystem, so a reader never observes a
 * half-written file and a crash mid-write leaves the previous version intact.
 */
export function writeFileAtomicSync(filePath, data) {
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, data, "utf8");
  fs.renameSync(tmp, filePath);
}

export async function writeFileAtomic(filePath, data) {
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fsp.writeFile(tmp, data, "utf8");
  await fsp.rename(tmp, filePath);
}
