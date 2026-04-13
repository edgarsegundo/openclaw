<!--
  ⚠️⚠️⚠️ ATENÇÃO! ⚠️⚠️⚠️

  O caminho absoluto "/home/ubuntu/openclaw/edgar" pode mudar conforme o ambiente, usuário ou servidor.
  Sempre verifique e ajuste este prefixo conforme o local onde o projeto está rodando!
  NÃO confie cegamente neste caminho em scripts de produção ou automações portáveis.
  Se migrar para outro servidor, usuário ou pasta, atualize todos os caminhos gerados aqui.

  (Este aviso é automático. Consulte a documentação do seu ambiente antes de usar!)
-->

# Linhas para carregar cada .env:

```bash
[ -f '/home/ubuntu/openclaw/edgar/api/.env' ] && export $(grep -v '^#' '/home/ubuntu/openclaw/edgar/api/.env' | xargs)
[ -f '/home/ubuntu/openclaw/edgar/automations/ai-client/.env' ] && export $(grep -v '^#' '/home/ubuntu/openclaw/edgar/automations/ai-client/.env' | xargs)
[ -f '/home/ubuntu/openclaw/edgar/automations/check-nubank-emails/.env' ] && export $(grep -v '^#' '/home/ubuntu/openclaw/edgar/automations/check-nubank-emails/.env' | xargs)
[ -f '/home/ubuntu/openclaw/edgar/automations/cron-manager/tasks/hello-world/.env' ] && export $(grep -v '^#' '/home/ubuntu/openclaw/edgar/automations/cron-manager/tasks/hello-world/.env' | xargs)
[ -f '/home/ubuntu/openclaw/edgar/automations/cron-manager/tasks/publish-article/.env' ] && export $(grep -v '^#' '/home/ubuntu/openclaw/edgar/automations/cron-manager/tasks/publish-article/.env' | xargs)
[ -f '/home/ubuntu/openclaw/edgar/automations/cron-manager/tasks/rss-picker/.env' ] && export $(grep -v '^#' '/home/ubuntu/openclaw/edgar/automations/cron-manager/tasks/rss-picker/.env' | xargs)
[ -f '/home/ubuntu/openclaw/edgar/automations/visa-crawler/.env' ] && export $(grep -v '^#' '/home/ubuntu/openclaw/edgar/automations/visa-crawler/.env' | xargs)
[ -f '/home/ubuntu/openclaw/edgar/channels/discord/.env' ] && export $(grep -v '^#' '/home/ubuntu/openclaw/edgar/channels/discord/.env' | xargs)
```

# Variáveis por .env:

## /home/ubuntu/openclaw/edgar/api/.env

```
API_KEY_MICROSEVICESADM
FASTVISTOS_API_URL
FASTVISTOS_BUSINESS_ID
```

## /home/ubuntu/openclaw/edgar/automations/ai-client/.env

```
OPENAI_API_KEY
PERPLEXITY_API_KEY
```

## /home/ubuntu/openclaw/edgar/automations/check-nubank-emails/.env

```
DISCORD_WEBHOOK_URL
FASTVISTOS_API_KEY
FASTVISTOS_API_URL
FASTVISTOS_BUSINESS_ID
MAIL_APP_PASSWORD
MAIL_USER
OPENAI_API_KEY
YOUR_BOT_TOKEN
YOUR_CHANNEL_ID
```

## /home/ubuntu/openclaw/edgar/automations/cron-manager/tasks/hello-world/.env

```
DEBUG_MODE
GREETING_PREFIX
```

## /home/ubuntu/openclaw/edgar/automations/cron-manager/tasks/publish-article/.env

```
MYSITESAPP_API_KEY
```

## /home/ubuntu/openclaw/edgar/automations/cron-manager/tasks/rss-picker/.env

```
DISCORD_WEBHOOK_URL
```

## /home/ubuntu/openclaw/edgar/automations/visa-crawler/.env

```
DISCORD_WEBHOOK_URL
PERPLEXITY_API_KEY
YOUR_BOT_TOKEN
YOUR_CHANNEL_ID
```

## /home/ubuntu/openclaw/edgar/channels/discord/.env

```
API_URL
FASTVISTOS_ARTICLE_CHANNEL_ID
FASTVISTOS_BOT_TOKEN
```

