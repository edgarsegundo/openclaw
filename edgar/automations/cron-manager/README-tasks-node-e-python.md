# Criar tasks — Node.js e Python

O cron-manager orquestra **toda** task da mesma forma: lê `task.config.yaml`,
importa `index.js` **no mesmo processo** e chama `export default (context)`. É o
`index.js` que recebe `inputs`, `saveArtifact`, `runPrompt`, `track`/`flow`.

Por isso **toda task tem um `index.js`** — inclusive as de Python. Numa task
Python o `index.js` é só uma **ponte fina** que dá spawn de `uv run main.py` e
devolve o resultado. A lógica de verdade fica em `main.py`, 100% desacoplada do
cron-manager.

```
Node task     runner → import(index.js) → sua lógica (in-process)
Python task   runner → import(index.js) → uv run main.py (subprocesso) → resultado
```

> O campo `entrypoint` no YAML é **informativo**. O runner sempre roda `index.js`.

---

## Escolha do ambiente Python: por task, não um env global

Cada task Python é isolada. Escolha o nível pela complexidade:

| Caso                 | Como                                          | Arquivos no diretório                                  |
| -------------------- | --------------------------------------------- | ------------------------------------------------------ |
| Task simples         | **PEP 723 inline** + `uv run main.py`         | só `main.py` com header `# /// script` declarando deps |
| Task com muitas deps | **projeto uv**                                | `main.py` + `pyproject.toml` + `uv.lock`               |
| Utilitários comuns   | pacote `tasks/common-py` como path dependency | —                                                      |

**Não** use um venv único compartilhado em `/tasks`: acumula conflito de deps e
acopla tasks sem relação. O `uv` tem cache global (hardlinks), então N ambientes
por task quase não pesam. Comece com PEP 723 — dá pra migrar pra `pyproject.toml`
depois sem tocar no `index.js`.

---

## Caminho rápido (as duas)

```bash
cd edgar/automations/cron-manager
node cron-manager.js create-task minha-task
# Runtime: → Node.js  ou  → Python
```

O gerador pergunta o **Runtime**. Ele cria:

- **Node**: `task.config.yaml` + `index.js` (+ scaffold de prompt template, se pedir)
- **Python**: `task.config.yaml` + `index.js` (ponte) + `main.py` (PEP 723)

Depois: `node cron-manager.js doctor` valida, `run <task>` executa.

---

## Passo a passo — Node.js

Task determinística (sem IA). Para task com IA/`runPrompt`, veja
[README-how-to-create-a-task.md](README-how-to-create-a-task.md).

1. **Criar**: `create-task minha-task-node` → Runtime **Node.js**.
2. **`task.config.yaml`** — declare `env_vars`, `inputs`, `artifacts`.
3. **`index.js`** — sua lógica:

```js
export default async function (context) {
  const { inputs, env, saveArtifact } = context;
  console.log(`Processando: ${inputs.termo}`); // vira log da run
  const data = await fazerAlgo(inputs.termo, env.MINHA_API_KEY);
  await saveArtifact("result", data); // artifacts/<task>/result.json
}
```

4. **Testar**: `node cron-manager.js run minha-task-node`

`context` traz: `inputs`, `env`, `saveArtifact`, `taskName`, `mode`,
`executionId`, `track`/`flow`, e `runPrompt` (quando um template é selecionado).

---

## Passo a passo — Python

1. **Criar**: `create-task minha-task-py` → Runtime **Python**.

Gera:

```
tasks/minha-task-py/task.config.yaml
tasks/minha-task-py/index.js     ← ponte (não precisa editar)
tasks/minha-task-py/main.py      ← sua lógica
```

2. **`task.config.yaml`** — declare `env_vars`, `inputs`, `artifacts` (igual ao Node).
   As env vars vão pro `os.environ` do Python automaticamente.

3. **`main.py`** — adicione deps no header PEP 723 e escreva a lógica:

```python
# /// script
# requires-python = ">=3.11"
# dependencies = ["httpx"]      # ← suas libs aqui
# ///
import json, os, sys

def emit_result(data):           # devolve JSON pro index.js (→ saveArtifact)
    sys.stdout.write("__TASK_RESULT__" + json.dumps(data) + "\n")
    sys.stdout.flush()

def main():
    payload = json.load(sys.stdin)           # { inputs, taskName, mode, executionId }
    inputs = payload["inputs"]
    print("processando...")                   # print() vira log da run
    result = {"ok": True}
    emit_result(result)

if __name__ == "__main__":
    main()
```

**Protocolo main.py ↔ index.js** (via `lib/py-bridge.js`):

- **stdin**: JSON `{ inputs, taskName, mode, executionId }`
- **stdout**: cada `print()` vira linha de log; a linha `__TASK_RESULT__<json>` vira o resultado
- **stderr**: capturado no log (tracebacks aparecem)
- **erro**: `raise` → exit ≠ 0 → a task falha

4. **Env var**: crie `tasks/minha-task-py/.env` (herdada pelo subprocesso).

5. **Testar**:

```bash
node cron-manager.js doctor
node cron-manager.js run minha-task-py
# rodar o main.py isolado (debug direto):
echo '{"inputs":{}}' | uv run tasks/minha-task-py/main.py
```

### Precisa de IA numa task Python?

`runPrompt` é nativo do Node. Chame no `index.js` (lado Node) e passe o
resultado pro Python no payload, ou faça a chamada de IA direto em Python com a
lib do provider. A ponte não repassa `runPrompt` pro Python.

### Migrar de PEP 723 → projeto uv

Quando as deps crescerem: `cd tasks/minha-task-py && uv init --script main.py`
ou crie um `pyproject.toml` + `uv.lock`. O `index.js` não muda — `uv run main.py`
usa o `pyproject.toml` do diretório automaticamente.

---

## Exemplo real: `youtube-nichos`

Task Python que estima vídeos publicados por nicho nos últimos N dias (YouTube
Data API v3). Veja [tasks/youtube-nichos/](tasks/youtube-nichos/):

- `main.py` — deps `["google-api-python-client"]` no header PEP 723
- `task.config.yaml` — env `YOUTUBE_API_KEY`, inputs `nichos`/`days`/`max_results`
- `index.js` — a ponte padrão

```bash
cp tasks/youtube-nichos/.env.template tasks/youtube-nichos/.env  # cole sua chave
node cron-manager.js run youtube-nichos
```

Resultado salvo em `artifacts/youtube-nichos/result.json`.
