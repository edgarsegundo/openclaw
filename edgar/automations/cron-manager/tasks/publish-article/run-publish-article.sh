#!/bin/bash

# Sem `set -e`: cada grupo é publicado de forma independente (ver run_group
# abaixo). Um grupo que falhe não deve impedir os demais de publicarem.

BASE="/home/ubuntu/openclaw/edgar/automations/cron-manager"
LOCK_FILE="/tmp/publish-article.lock"
cd "$BASE" || exit 1

# Garante que o lock seja removido ao sair (mesmo em caso de erro)
trap "[ -f '$LOCK_FILE' ] && rm -f '$LOCK_FILE'" EXIT

[ -f '/home/ubuntu/openclaw/edgar/automations/ai-client/.env' ] && export $(grep -v '^#' '/home/ubuntu/openclaw/edgar/automations/ai-client/.env' | xargs)
[ -f '/home/ubuntu/openclaw/edgar/automations/cron-manager/tasks/publish-article/.env' ] && export $(grep -v '^#' '/home/ubuntu/openclaw/edgar/automations/cron-manager/tasks/publish-article/.env' | xargs)

# Publica um grupo. A falha de um grupo é registrada e NÃO aborta os demais.
run_group() {
  local input_file="$1"
  echo "▶ Publicando: $input_file"
  if ! node cron-manager.js run publish-article --template skip --input-file "$input_file"; then
    echo "⚠️ Falhou: $input_file (seguindo para o próximo grupo)"
    failures=$((failures + 1))
  fi
}

# Executa publish-article para cada arquivo de input
echo "Rodando publish-article..."
failures=0
run_group tasks/publish-article/inputs/inputs-visto-americano.json
run_group tasks/publish-article/inputs/inputs-disney-orlando.json
run_group tasks/publish-article/inputs/inputs-emprego-campinas.json

if [ "$failures" -gt 0 ]; then
  echo "⚠️ Execuções finalizadas com $failures grupo(s) com falha."
else
  echo "✅ Execuções finalizadas com sucesso."
fi

# ============================================================================
# Como agendar este script no cron:
#
# 📌 IMPORTANTE: O script remove automaticamente o lock file ao finalizar,
#    mesmo em caso de erro. Nenhuma limpeza manual é necessária.
#
# 1. Torne o script executável:
#    chmod +x /home/ubuntu/openclaw/edgar/automations/cron-manager/tasks/publish-article/run-publish-article-visto-americano.sh
#
# 2. Edite o crontab:
#    crontab -e
#
# 3. Adicione o cron (ajuste o caminho absoluto conforme necessário):
#    Use >> para acumular ou > para sobrescrever o log:
#    
#    Exemplo: rodar a cada 6 horas:
#    0 */6 * * * flock -n /tmp/publish-article.lock timeout 10m /home/ubuntu/openclaw/edgar/automations/cron-manager/tasks/publish-article/run-publish-article-visto-americano.sh > /tmp/publish-article-visto-americano.log 2>&1
#
#    Exemplo: rodar 1x por dia (10:00 AM):
#    0 10 * * * flock -n /tmp/publish-article.lock timeout 15m /home/ubuntu/openclaw/edgar/automations/cron-manager/tasks/publish-article/run-publish-article-visto-americano.sh > /tmp/publish-article-visto-americano.log 2>&1
#
# 4. Para rotacionar o log automaticamente (recomendado se usar >>):
#    1. Crie um arquivo /etc/logrotate.d/publish-article-visto com o conteúdo:
#       /tmp/publish-article-visto-americano.log {
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
#    - Geralmente publish-article é mais rápido que write-article (não faz research web)
#    - Ajuste timeout conforme necessário (ex: 10m para */6, 15m para daily)
#
# Para usar um serviço de heartbeat/monitoramento externo (opcional):
# https://app.healthchecks.io/pricing
# https://app.uptimerobot.com/billing/pricing
#
# Exemplo com heartbeat:
# 0 10 * * * flock -n /tmp/publish-article.lock sh -c 'timeout 15m /home/ubuntu/openclaw/edgar/automations/cron-manager/tasks/publish-article/run-publish-article-visto-americano.sh > /tmp/publish-article-visto-americano.log 2>&1 && curl -fsS https://your-healthchecks-url'
#
# ============================================================================
