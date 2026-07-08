# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""
Task: {{NAME}} (Python)

Runs via `uv run main.py`, driven by the Node bridge (lib/py-bridge.js).
uv reads the PEP 723 header above to build an isolated, cached environment —
add your libraries to `dependencies` (e.g. ["httpx", "google-api-python-client"]).

── Protocol with cron-manager ────────────────────────────────────────────────
  stdin  : JSON  { inputs, taskName, mode, executionId }
  stdout : normal print() lines become log lines in the run log
  result : call emit_result(obj) to hand a JSON object back to index.js,
           which saves it as artifacts/{{NAME}}/result.json via saveArtifact()
  errors : raise — a non-zero exit fails the task and the traceback is logged

Env vars declared in task.config.yaml are already in os.environ (the runner
loaded every .env into the process the bridge inherits).
"""
import json
import sys


def emit_result(data: dict) -> None:
    """Hand a structured result back to the Node side (→ saveArtifact('result', ...))."""
    sys.stdout.write("__TASK_RESULT__" + json.dumps(data) + "\n")
    sys.stdout.flush()


def main() -> None:
    payload = json.load(sys.stdin)
    inputs = payload.get("inputs", {})

    print(f"Task {payload.get('taskName')} | mode={payload.get('mode')}")
    print(f"Inputs: {inputs}")

    # ── your logic here ───────────────────────────────────────────────────────
    result = {"ok": True, "inputs": inputs}

    emit_result(result)


if __name__ == "__main__":
    main()
