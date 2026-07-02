#!/bin/bash

set -e

BASE="/home/ubuntu/openclaw/edgar/automations/cron-manager"
LOCK_FILE="/tmp/write-article.lock"
cd "$BASE" || exit 1

# Garante que o lock seja removido ao sair (mesmo em caso de erro)
trap "[ -f '$LOCK_FILE' ] && rm -f '$LOCK_FILE'" EXIT

[ -f '/home/ubuntu/openclaw/edgar/automations/ai-client/.env' ] && export $(grep -v '^#' '/home/ubuntu/openclaw/edgar/automations/ai-client/.env' | xargs)

# Executa write-article for each input file
echo "[1/1] Rodando write-article..."
node cron-manager.js run write-article --template news --input-file tasks/write-article/inputs/inputs-visto-americano.json
node cron-manager.js run write-article --template news --input-file tasks/write-article/inputs/inputs-disney-orlando.json
node cron-manager.js run write-article --template news --input-file tasks/write-article/inputs/inputs-emprego-campinas.json

echo "✅ Execuções finalizadas com sucesso."

# ============================================================================
# Como agendar este script no cron:
#
# 📌 IMPORTANTE: O script remove automaticamente o lock file ao finalizar,
#    mesmo em caso de erro. Nenhuma limpeza manual é necessária.
#
# 1. Torne o script executável:
#    chmod +x /home/ubuntu/openclaw/edgar/automations/cron-manager/tasks/write-article/run-write-article-visto-americano.sh
#
# 2. Edite o crontab:
#    crontab -e
#
# 3. Adicione o cron (ajuste o caminho absoluto conforme necessário):
#    Use >> para acumular ou > para sobrescrever o log:
#    
#    Exemplo: rodar a cada 5 minutos:
#    */5 * * * * flock -n /tmp/write-article.lock timeout 4m /home/ubuntu/openclaw/edgar/automations/cron-manager/tasks/write-article/run-write-article-visto-americano.sh > /tmp/write-article-visto-americano.log 2>&1
#
#    Exemplo: rodar 1x por dia (08:00 AM):
#    0 8 * * * flock -n /tmp/write-article.lock timeout 15m /home/ubuntu/openclaw/edgar/automations/cron-manager/tasks/write-article/run-write-article-visto-americano.sh > /tmp/write-article-visto-americano.log 2>&1
#
# 4. Para rotacionar o log automaticamente (recomendado se usar >>):
#    1. Crie um arquivo /etc/logrotate.d/write-article-visto com o conteúdo:
#       /tmp/write-article-visto-americano.log {
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
#    - Ajuste timeout conforme necessário (ex: 4m para */5, 15m para daily)
#
# Para usar um serviço de heartbeat/monitoramento externo (opcional):
# https://app.healthchecks.io/pricing
# https://app.uptimerobot.com/billing/pricing
#
# Exemplo com heartbeat:
# */5 * * * * flock -n /tmp/write-article.lock sh -c 'timeout 4m /home/ubuntu/openclaw/edgar/automations/cron-manager/tasks/write-article/run-write-article-visto-americano.sh > /tmp/write-article-visto-americano.log 2>&1 && curl -fsS https://your-healthchecks-url'
#
# ============================================================================
