#!/bin/bash

set -euo pipefail

BASE="/home/edgar/Repos/openclaw/edgar/automations/cron-manager"
LOCK_FILE="/tmp/prune-tracking.lock"
DAYS="${PRUNE_DAYS:-7}"

cd "$BASE" || exit 1

# Garante que o lock seja removido ao sair (mesmo em caso de erro)
trap "[ -f '$LOCK_FILE' ] && rm -f '$LOCK_FILE'" EXIT

if [ -f "/home/edgar/Repos/openclaw/edgar/automations/ai-client/.env" ]; then
  set -a
  source /home/edgar/Repos/openclaw/edgar/automations/ai-client/.env
  set +a
fi

echo "[prune-tracking] Removendo registros com mais de ${DAYS} dias..."

node cron-manager.js prune-tracking --days "$DAYS"

echo "[prune-tracking] Concluído."

# ============================================================================
# Como agendar este script no cron:
#
# 📌 IMPORTANTE: O script remove automaticamente o lock file ao finalizar,
#    mesmo em caso de erro. Nenhuma limpeza manual é necessária.
#
# 1. Torne o script executável:
#    chmod +x /home/edgar/Repos/openclaw/edgar/automations/cron-manager/run-prune-tracking.sh
#
# 2. Edite o crontab:
#    crontab -e
#
# 3. Adicione o cron semanal (domingo 04:00):
#
#    0 4 * * 0 flock -n /tmp/prune-tracking.lock timeout 5m /home/edgar/Repos/openclaw/edgar/automations/cron-manager/run-prune-tracking.sh >> /tmp/prune-tracking.log 2>&1
#
#    Para manter mais ou menos dias, passe PRUNE_DAYS antes do script:
#    0 4 * * 0 flock -n /tmp/prune-tracking.lock PRUNE_DAYS=14 timeout 5m /home/edgar/Repos/openclaw/edgar/automations/cron-manager/run-prune-tracking.sh >> /tmp/prune-tracking.log 2>&1
#
# 4. Para rotacionar o log automaticamente (recomendado se usar >>):
#    Crie /etc/logrotate.d/prune-tracking com o conteúdo:
#       /tmp/prune-tracking.log {
#           size 1M
#           rotate 3
#           missingok
#           notifempty
#           compress
#           copytruncate
#       }
#
# 📝 Notas:
#    - flock -n evita sobreposição com outros crons (saí imediatamente se travado)
#    - timeout 5m encerra se demorar mais que 5 minutos (DB + limpeza de logs)
#    - O trap garante que o lock seja limpo mesmo em caso de erro
#    - PRUNE_DAYS padrão = 7; sobrescreva via variável de ambiente
#
# Para checar o resultado sem rodar o cron:
#    node cron-manager.js pipeline          # funil + itens presos + erros recentes
#    node cron-manager.js prune-tracking --days 7   # rodar limpeza manualmente
#    node cron-manager.js wipe-tracking             # zerar tudo (pede confirmação)
#
# ============================================================================
