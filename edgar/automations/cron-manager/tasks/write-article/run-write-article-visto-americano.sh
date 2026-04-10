#!/bin/bash

set -e

BASE="/home/ubuntu/openclaw/edgar/automations/cron-manager"
cd "$BASE" || exit 1

[ -f '/home/ubuntu/openclaw/edgar/automations/ai-client/.env' ] && export $(grep -v '^#' '/home/ubuntu/openclaw/edgar/automations/ai-client/.env' | xargs)

# Executa write-article
echo "[1/1] Rodando write-article..."
node cron-manager.js run write-article --template news --input-file tasks/write-article/inputs/inputs-visto-americano.json

echo "✅ Execução finalizada com sucesso."

# ============================================================================
# Como agendar este script no cron:
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
#    Exemplo: rodar 1x por dia (08:00 AM):
#    0 8 * * * timeout 15m /home/ubuntu/openclaw/edgar/automations/cron-manager/tasks/write-article/run-write-article-visto-americano.sh > /tmp/write-article-visto-americano.log 2>&1
#
#    Exemplo com flock (recomendado para evitar múltiplas instâncias):
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
# Frequência recomendada: 1x por dia (horário de menor carga/custo da IA).
# Ajuste o schedule conforme a frequência que deseja gerar artigos.
#
# Para usar um serviço de heartbeat/monitoramento externo (recomendado):
# https://app.healthchecks.io/pricing
# https://app.uptimerobot.com/billing/pricing
#
# Exemplo com heartbeat:
# 0 8 * * * flock -n /tmp/write-article.lock sh -c 'timeout 15m /home/ubuntu/openclaw/edgar/automations/cron-manager/tasks/write-article/run-write-article-visto-americano.sh > /tmp/write-article-visto-americano.log 2>&1 && curl -fsS https://your-healthchecks-url'
#
# ============================================================================
