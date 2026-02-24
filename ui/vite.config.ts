import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));

function normalizeBase(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "/";
  }
  if (trimmed === "./") {
    return "./";
  }
  if (trimmed.endsWith("/")) {
    return trimmed;
  }
  return `${trimmed}/`;
}

function monkeypatch(originalSubpath: string, monkeypatchPath: string): Plugin {
  const monkeyFile = path.resolve(here, monkeypatchPath);
  return {
    name: `monkeypatch-${path.basename(originalSubpath)}`,
    load(id) {
      if (id.includes(originalSubpath) && existsSync(monkeyFile)) {
        process.stderr.write(`[monkeypatch] ${originalSubpath} → ${monkeyFile}\n`);
        return readFileSync(monkeyFile, "utf-8");
      }
    },
  };
}

export default defineConfig(() => {
  const envBase = process.env.OPENCLAW_CONTROL_UI_BASE_PATH?.trim();
  const base = envBase ? normalizeBase(envBase) : "./";

  return {
    base,
    plugins: [
      monkeypatch("src/ui/navigation.ts", "../edgar/monkeypatches/navigation.ts"),
      monkeypatch("src/i18n/locales/en.ts", "../edgar/monkeypatches/en.ts"),
    ],
    publicDir: path.resolve(here, "public"),
    optimizeDeps: {
      include: ["lit/directives/repeat.js"],
    },
    build: {
      outDir: path.resolve(here, "../dist/control-ui"),
      emptyOutDir: true,
      sourcemap: true,
    },
    server: {
      host: true,
      port: 5173,
      strictPort: true,
    },
  };
});
