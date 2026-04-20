#!/bin/bash

set -e

BASE="/home/ubuntu/openclaw/edgar/automations/cron-manager"
LOCK_FILE="/tmp/rss-fetcher-disney-orlando.lock"
cd "$BASE" || exit 1

# Garante que o lock seja removido ao sair (mesmo em caso de erro)
trap "[ -f '$LOCK_FILE' ] && rm -f '$LOCK_FILE'" EXIT

[ -f '/home/ubuntu/openclaw/edgar/automations/ai-client/.env' ] && export $(grep -v '^#' '/home/ubuntu/openclaw/edgar/automations/ai-client/.env' | xargs)
[ -f '/home/ubuntu/openclaw/edgar/automations/cron-manager/tasks/rss-picker/.env' ] && export $(grep -v '^#' '/home/ubuntu/openclaw/edgar/automations/cron-manager/tasks/rss-picker/.env' | xargs)

# Executa rss-fetcher
echo "[1/2] Rodando rss-fetcher for Disney Orlando..."
node cron-manager.js run rss-fetcher --template skip --input-file tasks/rss-fetcher/inputs/inputs-disney-orlando.json

# echo "[2/2] Rodando rss-picker for Disney Orlando..."
node cron-manager.js run rss-picker --template feed-selector-news-related --input-file tasks/rss-picker/inputs/inputs-disney-orlando.json

echo "Sequência finalizada com sucesso."

# ============================================================================
# Como agendar este script no cron:
#
# 📌 IMPORTANTE: O script remove automaticamente o lock file ao finalizar,
#    mesmo em caso de erro. Nenhuma limpeza manual é necessária.
#
# 1. Torne o script executável:
#    chmod +x /home/ubuntu/openclaw/edgar/automations/cron-manager/tasks/rss-fetcher/run-disney-orlando.sh
#
# 2. Edite o crontab:
#    crontab -e
#
# 3. Adicione o cron (ajuste o caminho absoluto conforme necessário):
#    Use >> para acumular ou > para sobrescrever o log:
#    
#    Exemplo: rodar a cada 30 minutos:
#    */30 * * * * flock -n /tmp/rss-fetcher.lock timeout 25m /home/ubuntu/openclaw/edgar/automations/cron-manager/tasks/rss-fetcher/run-visto-americano.sh > /tmp/rss-fetcher-visto-americano.log 2>&1
#
#    Exemplo: rodar a cada 10 minutos (para notícias quentes):
#    */10 * * * * flock -n /tmp/rss-fetcher.lock timeout 8m /home/ubuntu/openclaw/edgar/automations/cron-manager/tasks/rss-fetcher/run-visto-americano.sh > /tmp/rss-fetcher-visto-americano.log 2>&1
#
# 4. Para rotacionar o log automaticamente (recomendado se usar >>):
#    1. Crie um arquivo /etc/logrotate.d/rss-fetcher-visto com o conteúdo:
#       /tmp/rss-fetcher-visto-americano.log {
#           size 1M
#           rotate 5
#           missingok
#           notifempty
#           compress
#           copytruncate
#       }
#    2. O logrotate já roda periodicamente via cron do sistema.
#
# 📝 Notas:
#    - flock -n evita múltiplas execuções simultâneas
#    - timeout interrompe se exceder o tempo limite
#    - O trap garante que o lock seja limpo mesmo em caso de erro
#    - Frequência recomendada: 10 a 30 minutos (ajuste conforme necessário)
#    - Este script executa rss-fetcher e, ao terminar, executa rss-picker em sequência
#
# Para usar um serviço de heartbeat/monitoramento externo (opcional):
# https://app.healthchecks.io/pricing
# https://app.uptimerobot.com/billing/pricing
#
# Exemplo com heartbeat:
# */30 * * * * flock -n /tmp/rss-fetcher.lock sh -c 'timeout 25m /home/ubuntu/openclaw/edgar/automations/cron-manager/tasks/rss-fetcher/run-visto-americano.sh > /tmp/rss-fetcher-visto-americano.log 2>&1 && curl -fsS https://your-healthchecks-url'
#
# ============================================================================
