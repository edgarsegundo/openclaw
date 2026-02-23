# OpenClaw Automations (Deterministic Jobs)

Este tutorial apresenta um novo conceito para criar jobs **determinísticos** no OpenClaw, que executam scripts Node diretamente, **sem LLM e sem gastar tokens**. É inspirado no modelo de skills, mas totalmente independente.

---

## Estrutura recomendada

Cada job fica em sua própria pasta dentro de `automations/`:

```

~/openclaw/
automations/
hello-baby/
index.js
AUTOMATION.md
cleanup-logs/
index.js
AUTOMATION.md
send-reminder/
index.js
AUTOMATION.md

```

- `index.js`: contém todo o código que será executado pelo cron
- `AUTOMATION.md`: documentação do job, explicando o que faz e como criar o cron

---

## Passo 1: Criar o job

1. Crie uma nova pasta em `automations/` com o nome do job
2. Crie `index.js` com o código que você quer executar, por exemplo:

```js
// hello-baby/index.js
import { appendFileSync } from "fs";

const name = process.argv[2] || "baby";
const msg = `Hello, ${name}!`;

appendFileSync("/tmp/hello_executions.log", `[${new Date().toISOString()}] ${msg}\n`);
console.log(msg);
```

> Dica: pode executar qualquer código Node, incluindo chamar skills se desejar, mas qualquer chamada a LLM vai consumir tokens.

---

## Passo 2: Documentar o job

Crie `AUTOMATION.md` explicando a finalidade do job e como criar o cron:

````markdown
# Hello Baby Automation

Descrição: escreve uma saudação em `/tmp/hello_executions.log` de forma determinística, sem LLM.

## Como criar o cron job

```bash
openclaw cron add \
  --agent default \
  --name "hello-baby-job" \
  --every 5m \
  --message "run" \
  --no-deliver \
  --thinking off \
  --session isolated
```
````

````

---

## Passo 3: Criar o cron job

Use o comando abaixo, substituindo nome do job, intervalo e caminho do script:

```bash
openclaw cron add \
  --agent default \
  --name "<nome-do-job>" \
  --every <intervalo> \
  --message "run" \
  --no-deliver \
  --thinking off \
  --session isolated
````

- `--agent default`: roda local, zero token
- `--message "run"`: necessário para jobs isolados, mas não ativa LLM
- `--no-deliver` + `--session isolated`: impede envio de mensagens à sessão principal
- `--thinking off`: desativa qualquer processamento LLM

> Observação: Jobs determinísticos **não dependem de LLM**, mas podem chamar skills que usam LLM se necessário.

---

## Passo 4: Boas práticas

- Cada job deve ser independente, em sua própria pasta
- Use caminhos absolutos para scripts externos
- Documente cada job com `AUTOMATION.md`
- Zero LLM → zero token, exceto se chamar skills que usam LLM

---

## Passo 5: Exemplos de jobs determinísticos

1. **hello-baby** → escreve mensagem no log
2. **cleanup-logs** → limpa arquivos temporários ou logs
3. **send-reminder** → envia lembretes ou escreve logs de lembrete

Cada um segue a mesma estrutura: pasta própria, `index.js`, `AUTOMATION.md`, e cron job configurado com `--message`, `--no-deliver` e `--session isolated`.

---

## ✅ Vantagens do modelo Automations

- Escalável: basta criar nova pasta + index.js + cron
- Autônomo: não precisa mexer em arquivos adicionais depois
- Documentado: cada job tem README próprio
- Zero token para execução determinística
- Mistura fácil de jobs determinísticos com skills opcionais, mantendo controle de custos

---

## Conclusão

Este modelo permite criar **Automations determinísticas** no OpenClaw que:

- Roda Node puro diretamente
- Não consome tokens
- É totalmente previsível e confiável
- Mantém estrutura clara, como skills, mas independente do LLM

```

---

Se você quiser, posso **criar uma versão pronta desse `.md` já com os 3 jobs de exemplo**, que você só copia para a pasta `automations/` e compartilha com a comunidade.

Quer que eu faça isso?
```
