/**
 * py-bridge — runs a Python task as a subprocess and bridges it to the
 * cron-manager task contract.
 *
 * The runner always imports `index.js` in-process (see runner.js), so a Python
 * task keeps a thin `index.js` shim that calls `runPython()` from here. The real
 * logic lives in `main.py`, which stays completely decoupled from cron-manager.
 *
 * ── Protocol ──────────────────────────────────────────────────────────────────
 *   stdin  : JSON payload  { inputs, taskName, mode, executionId }
 *   stdout : each line is forwarded as a log line (captured into the run log),
 *            EXCEPT a line starting with the RESULT_MARKER, whose JSON payload
 *            becomes the return value (typically passed to saveArtifact()).
 *   stderr : forwarded as log lines too, so Python tracebacks show up in logs.
 *
 * Python side emits the result with:
 *   sys.stdout.write("__TASK_RESULT__" + json.dumps(data) + "\n")
 * (the main.py template ships an `emit_result()` helper that does this).
 *
 * Deps: uses `uv run main.py`, so each task manages its own deps via PEP 723
 * inline metadata or a pyproject.toml in the task dir. Env vars are inherited
 * from process.env — the runner has already loaded all .env files into it.
 */
import { spawn } from "node:child_process";

const RESULT_MARKER = "__TASK_RESULT__";

/**
 * @param {string} taskDir  absolute path to the task directory (import.meta.dirname)
 * @param {object} payload  serialized to stdin as JSON { inputs, taskName, mode, executionId }
 * @param {object} [opts]
 * @param {string} [opts.script="main.py"]  entry script, resolved relative to taskDir
 * @param {string[]} [opts.uvArgs=[]]       extra args inserted before the script (e.g. ["--python","3.12"])
 * @param {(line: string) => void} [opts.log=console.log]  log sink (defaults to captured console.log)
 * @returns {Promise<any|null>}  the parsed result payload, or null if none was emitted
 */
export function runPython(taskDir, payload, opts = {}) {
  const { script = "main.py", uvArgs = [], log = console.log } = opts;

  return new Promise((resolve, reject) => {
    const child = spawn("uv", ["run", ...uvArgs, script], {
      cwd: taskDir,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let result = null;
    let sawResult = false;
    let outBuf = "";
    let errBuf = "";

    const handleOutLine = (line) => {
      if (line.startsWith(RESULT_MARKER)) {
        try {
          result = JSON.parse(line.slice(RESULT_MARKER.length));
          sawResult = true;
        } catch (err) {
          log(`[py-bridge] could not parse task result: ${err.message}`);
        }
      } else if (line.length > 0) {
        log(line);
      }
    };

    const drain = (buf, handler) => {
      let acc = buf;
      let idx;
      while ((idx = acc.indexOf("\n")) >= 0) {
        handler(acc.slice(0, idx).replace(/\r$/, ""));
        acc = acc.slice(idx + 1);
      }
      return acc; // remaining partial line
    };

    child.stdout.on("data", (d) => {
      outBuf = drain(outBuf + d.toString(), handleOutLine);
    });
    child.stderr.on("data", (d) => {
      errBuf = drain(errBuf + d.toString(), (line) => {
        if (line.length > 0) log(`[py] ${line}`);
      });
    });

    child.on("error", (err) => {
      if (err.code === "ENOENT") {
        reject(new Error("`uv` not found on PATH. Install it: https://docs.astral.sh/uv/"));
      } else {
        reject(err);
      }
    });

    child.on("close", (code) => {
      if (outBuf.length > 0) handleOutLine(outBuf.replace(/\r$/, ""));
      if (errBuf.length > 0) log(`[py] ${errBuf.replace(/\r$/, "")}`);

      if (code === 0) {
        resolve(sawResult ? result : null);
      } else {
        reject(new Error(`Python task "${script}" exited with code ${code}`));
      }
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

export { RESULT_MARKER };
