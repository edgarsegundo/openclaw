
# Linhas para carregar cada .env:

```bash
[ -f '/Users/edgar/Repos/openclaw/edgar/api/.env' ] && export $(grep -v '^#' '/Users/edgar/Repos/openclaw/edgar/api/.env' | xargs)
[ -f '/Users/edgar/Repos/openclaw/edgar/automations/ai-client/.env' ] && export $(grep -v '^#' '/Users/edgar/Repos/openclaw/edgar/automations/ai-client/.env' | xargs)
[ -f '/Users/edgar/Repos/openclaw/edgar/automations/check-nubank-emails/.env' ] && export $(grep -v '^#' '/Users/edgar/Repos/openclaw/edgar/automations/check-nubank-emails/.env' | xargs)
[ -f '/Users/edgar/Repos/openclaw/edgar/automations/cron-manager/tasks/hello-world/.env' ] && export $(grep -v '^#' '/Users/edgar/Repos/openclaw/edgar/automations/cron-manager/tasks/hello-world/.env' | xargs)
[ -f '/Users/edgar/Repos/openclaw/edgar/automations/cron-manager/tasks/publish-article/.env' ] && export $(grep -v '^#' '/Users/edgar/Repos/openclaw/edgar/automations/cron-manager/tasks/publish-article/.env' | xargs)
[ -f '/Users/edgar/Repos/openclaw/edgar/automations/visa-crawler/.env' ] && export $(grep -v '^#' '/Users/edgar/Repos/openclaw/edgar/automations/visa-crawler/.env' | xargs)
```
