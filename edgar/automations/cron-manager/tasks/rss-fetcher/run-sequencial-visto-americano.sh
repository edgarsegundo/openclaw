# Como agendar este script no cron (a cada 10 minutos):
#
# Para atualizar a lista de .envs usados neste script:
#   1. Execute o script list-all-envs-and-loaders.sh a partir do diretório /edgar:
#        cd /caminho/para/edgar
#        ./list-all-envs-and-loaders.sh
#   2. Abra o arquivo env-loaders.md gerado e copie as linhas relevantes para este script,
#      logo após o #!/bin/bash.
#   3. Edite conforme necessário para carregar apenas os .env que fazem sentido para esta automação.
#       ex:
#           [ -f '/Users/edgar/Repos/openclaw/edgar/automations/ai-client/.env' ] && export $(grep -v '^#' '/Users/edgar/Repos/openclaw/edgar/automations/ai-client/.env' | xargs)
#           [ -f '/Users/edgar/Repos/openclaw/edgar/automations/visa-crawler/.env' ] && export $(grep -v '^#' '/Users/edgar/Repos/openclaw/edgar/automations/visa-crawler/.env' | xargs)
#
# 1. Torne o script executável:
#    chmod +x /caminho/para/run-sequencial-visto-americano.sh
#
# 2. Edite o crontab:
#    crontab -e
#
# 3. Adicione o cron (ajuste o caminho absoluto):
#    Use >> para acumular ou > para sobrescrever o log:
#    ex: */10 * * * * /caminho/para/run-sequencial-visto-americano.sh > /tmp/rss-fetcher-visto.log 2>&1
#
#   Ou para rotacionar o log automaticamente (recomendado se usar >>):
#       1. Crie um arquivo /etc/logrotate.d/rss-fetcher-visto com o conteúdo:
#           /tmp/rss-fetcher-visto.log {
#               size 1M
#               rotate 5
#               missingok
#               notifempty
#               compress
#               copytruncate
#           }
#       2. O logrotate já roda periodicamente via cron do sistema.
#
# Frequência recomendada para notícias: 10 a 30 minutos.
# Para notícias muito quentes, use 5 minutos. Para menor volume, 30-60 minutos.
#
# Este script executa rss-fetcher e, ao terminar, executa rss-picker em sequência.
#

#!/bin/bash
set -e

[ -f '/Users/edgar/Repos/openclaw/edgar/automations/ai-client/.env' ] && export $(grep -v '^#' '/Users/edgar/Repos/openclaw/edgar/automations/ai-client/.env' | xargs)
[ -f '/Users/edgar/Repos/openclaw/edgar/automations/visa-crawler/.env' ] && export $(grep -v '^#' '/Users/edgar/Repos/openclaw/edgar/automations/visa-crawler/.env' | xargs)

# Executa rss-fetcher
echo "[1/2] Rodando rss-fetcher..."
node ../../../../bin/cron-manager.js run rss-fetcher --template skip --input-file ../rss-fetcher/inputs/rss-inputs-visto-americano.json

echo "[2/2] Rodando rss-picker..."
node ../../../../bin/cron-manager.js run rss-picker --template feed-selector-visto-americano --input-file ../rss-picker/inputs/inputs-visto-americano.json

echo "Sequência finalizada com sucesso."
