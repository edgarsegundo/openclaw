# Hello Baby Automation

Este job executa **direto o código Node**, sem LLM, de forma determinística.

## Como criar o job no OpenClaw

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
