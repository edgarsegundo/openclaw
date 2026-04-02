# How to create a task

## Passo 1 — Criar a task (o CLI faz tudo)

```bash
cd edgar/automations/cron-manager
node bin/cron-manager.js create-task hello-world
```

Ele vai perguntar:

- **Description**: `Simple hello world for testing`
- **Allow manual run?**: `Y`
- **Allow cron run?**: `Y`
- **Cron expression**: deixa vazio (enter)

Isso cria `tasks/hello-world/task.config.yaml` + `tasks/hello-world/index.js` automaticamente.

---

## Passo 2 — Editar o YAML para adicionar inputs e env vars

Abra `tasks/hello-world/task.config.yaml` e substitua as seções `env_vars` e `inputs` por:

```yaml
env_vars:
  common:
    - name: GREETING_PREFIX
      required: true
      help_tip: Prefix for the greeting (e.g. Hello, Hi)
  manual:
    - name: DEBUG_MODE
      required: false
      default: "false"
      help_tip: Enable debug output
  cron: []

inputs:
  - name: username
    type: string
    required: true
    default:
    help_tip: Who do you want to greet?
  - name: repeat
    type: number
    required: false
    default: 1
    help_tip: How many times to repeat
  - name: shout
    type: boolean
    required: false
    default: false
    help_tip: UPPERCASE the output?
  - name: date
    type: date
    required: false
    default: "2026-04-02"
    help_tip: Reference date (YYYY-MM-DD)
```

---

## Passo 3 — Editar o index.js com a lógica

Substitua o conteúdo de `tasks/hello-world/index.js` por:

```js
export default async function (context) {
  const { taskName, inputs, env, mode, executionId } = context;

  const prefix = env.GREETING_PREFIX || "Hello";
  const username = inputs.username || "World";
  const repeat = inputs.repeat || 1;
  const shout = inputs.shout || false;

  console.log(`Task: ${taskName} | Mode: ${mode}`);
  console.log(`Execution: ${executionId}`);
  console.log(`Date: ${inputs.date || "unknown"}`);
  console.log("---");

  for (let i = 0; i < repeat; i++) {
    let msg = `${prefix}, ${username}!`;
    if (shout) msg = msg.toUpperCase();
    console.log(msg);
  }

  if (env.DEBUG_MODE === "true") {
    console.log("--- DEBUG ---");
    console.log("env:", JSON.stringify(env));
    console.log("inputs:", JSON.stringify(inputs));
  }

  console.log("---");
  console.log("Done!");
}
```

---

## Passo 4 — Testar

```bash
# Valida a task
node bin/cron-manager.js doctor

# Preview sem executar
node bin/cron-manager.js run hello-world --dry-run

# Rodar manual (precisa da env var)
GREETING_PREFIX="Hello" node bin/cron-manager.js run hello-world

# Rodar cron (vai falhar — username required sem default)
GREETING_PREFIX="Hi" node bin/cron-manager.js run hello-world --mode cron
```

Vai fazendo e me diz!
