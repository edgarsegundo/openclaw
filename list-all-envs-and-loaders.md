
# Linhas para carregar cada .env:

```bash
[ -f '/Users/edgar/Repos/openclaw/edgar/api/.env' ] && export $(grep -v '^#' '/Users/edgar/Repos/openclaw/edgar/api/.env' | xargs)
[ -f '/Users/edgar/Repos/openclaw/edgar/automations/ai-client/.env' ] && export $(grep -v '^#' '/Users/edgar/Repos/openclaw/edgar/automations/ai-client/.env' | xargs)
[ -f '/Users/edgar/Repos/openclaw/edgar/automations/check-nubank-emails/.env' ] && export $(grep -v '^#' '/Users/edgar/Repos/openclaw/edgar/automations/check-nubank-emails/.env' | xargs)
[ -f '/Users/edgar/Repos/openclaw/edgar/automations/cron-manager/tasks/hello-world/.env' ] && export $(grep -v '^#' '/Users/edgar/Repos/openclaw/edgar/automations/cron-manager/tasks/hello-world/.env' | xargs)
[ -f '/Users/edgar/Repos/openclaw/edgar/automations/cron-manager/tasks/publish-article/.env' ] && export $(grep -v '^#' '/Users/edgar/Repos/openclaw/edgar/automations/cron-manager/tasks/publish-article/.env' | xargs)
[ -f '/Users/edgar/Repos/openclaw/edgar/automations/cron-manager/tasks/rss-picker/.env' ] && export $(grep -v '^#' '/Users/edgar/Repos/openclaw/edgar/automations/cron-manager/tasks/rss-picker/.env' | xargs)
[ -f '/Users/edgar/Repos/openclaw/edgar/automations/visa-crawler/.env' ] && export $(grep -v '^#' '/Users/edgar/Repos/openclaw/edgar/automations/visa-crawler/.env' | xargs)
[ -f '/Users/edgar/Repos/openclaw/edgar/channels/discord/.env' ] && export $(grep -v '^#' '/Users/edgar/Repos/openclaw/edgar/channels/discord/.env' | xargs)
```

# Variáveis por .env:

## /Users/edgar/Repos/openclaw/edgar/api/.env

```
API_KEY_MICROSEVICESADM
FASTVISTOS_API_URL
FASTVISTOS_BUSINESS_ID
```

## /Users/edgar/Repos/openclaw/edgar/automations/ai-client/.env

```
OPENAI_API_KEY
PERPLEXITY_API_KEY
```

## /Users/edgar/Repos/openclaw/edgar/automations/check-nubank-emails/.env

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

## /Users/edgar/Repos/openclaw/edgar/automations/cron-manager/tasks/hello-world/.env

```
DEBUG_MODE
GREETING_PREFIX
```

## /Users/edgar/Repos/openclaw/edgar/automations/cron-manager/tasks/publish-article/.env

```
MYSITESAPP_API_KEY
```

## /Users/edgar/Repos/openclaw/edgar/automations/cron-manager/tasks/rss-picker/.env

```
DISCORD_WEBHOOK_URL
```

## /Users/edgar/Repos/openclaw/edgar/automations/visa-crawler/.env

```
DISCORD_WEBHOOK_URL
PERPLEXITY_API_KEY
YOUR_BOT_TOKEN
YOUR_CHANNEL_ID
```

## /Users/edgar/Repos/openclaw/edgar/channels/discord/.env

```
API_URL
FASTVISTOS_ARTICLE_CHANNEL_ID
FASTVISTOS_BOT_TOKEN
```

