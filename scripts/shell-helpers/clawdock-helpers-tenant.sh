#!/usr/bin/env bash
# ClawDock Tenant - Docker helpers for OpenClaw (tenant-aware)
# Adaptado para ambientes multi-tenant (ex: /opt/openclaw/<tenant>)
#
# Uso:
#   export TENANT_DIR=/opt/openclaw/edgar
#   source /caminho/para/clawdock-helpers-tenant.sh
#   clawdock-tenant-start

# =============================================================================
# Colors
# =============================================================================
_CLR_RESET='\033[0m'
_CLR_BOLD='\033[1m'
_CLR_DIM='\033[2m'
_CLR_GREEN='\033[0;32m'
_CLR_YELLOW='\033[1;33m'
_CLR_BLUE='\033[0;34m'
_CLR_MAGENTA='\033[0;35m'
_CLR_CYAN='\033[0;36m'
_CLR_RED='\033[0;31m'

_clr_cmd() {
  echo -e "${_CLR_GREEN}${_CLR_BOLD}$1${_CLR_RESET}"
}

_cmd() {
  echo "${_CLR_GREEN}${_CLR_BOLD}$1${_CLR_RESET}"
}

# =============================================================================
# Tenant Config
# =============================================================================

# Garante que TENANT_DIR está setado e válido
_clawdock_tenant_ensure_dir() {
  if [[ -z "$TENANT_DIR" || ! -f "$TENANT_DIR/docker-compose.yml" ]]; then
    echo "❌ Defina TENANT_DIR para o diretório do tenant (ex: /opt/openclaw/edgar)"
    return 1
  fi
}

# Wrapper para docker compose, sempre usando --project-name único por tenant
_clawdock_tenant_compose() {
  _clawdock_tenant_ensure_dir || return 1
  # Usa o nome do diretório do tenant como project name
  local project_name
  project_name="$(basename "$TENANT_DIR")"
  command docker compose --env-file "$TENANT_DIR/.env" -p "$project_name" -f "$TENANT_DIR/docker-compose.yml" "$@"
}

# Lê o token do .env do tenant
_clawdock_tenant_read_env_token() {
  _clawdock_tenant_ensure_dir || return 1
  if [[ ! -f "$TENANT_DIR/.env" ]]; then
    return 1
  fi
  local raw
  raw=$(sed -n 's/^OPENCLAW_GATEWAY_TOKEN=//p' "$TENANT_DIR/.env" | head -n 1)
  raw="${raw%\r}" # remove \r se vier de Windows
  raw="${raw%\n}"
  raw="${raw%\"}"
  raw="${raw#\"}"
  printf "%s" "$raw"
}

# Operações básicas
clawdock-tenant-start() {
  _clawdock_tenant_compose up -d openclaw-gateway
}

clawdock-tenant-stop() {
  _clawdock_tenant_compose down
}

clawdock-tenant-restart() {
  _clawdock_tenant_compose restart openclaw-gateway
}

clawdock-tenant-logs() {
  _clawdock_tenant_compose logs -f openclaw-gateway
}

clawdock-tenant-status() {
  _clawdock_tenant_compose ps
}

# Token
clawdock-tenant-token() {
  _clawdock_tenant_read_env_token
}

# Fix token config
clawdock-tenant-fix-token() {
  _clawdock_tenant_ensure_dir || return 1
  echo "🔧 Configurando gateway token..."
  local token
  token=$(clawdock-tenant-token)
  if [[ -z "$token" ]]; then
    echo "❌ Não foi possível encontrar o token no .env"
    echo "   Verifique: $TENANT_DIR/.env"
    return 1
  fi
  echo "📝 Setando token: ${token:0:20}..."
  _clawdock_tenant_compose exec -e "TOKEN=$token" openclaw-gateway \
    bash -c './openclaw.mjs config set gateway.remote.token "$TOKEN" && ./openclaw.mjs config set gateway.auth.token "$TOKEN"'
  echo "🔄 Reiniciando gateway..."
  _clawdock_tenant_compose restart openclaw-gateway
  echo "✅ Token configurado e gateway reiniciado."
}

# Ajuda
clawdock-tenant-help() {
  echo -e "\n${_CLR_BOLD}${_CLR_CYAN}🦞 ClawDock Tenant - Docker Helpers (multi-tenant)${_CLR_RESET}\n"
  echo -e "  $(_cmd clawdock-tenant-start)         ${_CLR_DIM}Start gateway do tenant${_CLR_RESET}"
  echo -e "  $(_cmd clawdock-tenant-stop)          ${_CLR_DIM}Stop gateway do tenant${_CLR_RESET}"
  echo -e "  $(_cmd clawdock-tenant-restart)       ${_CLR_DIM}Restart gateway do tenant${_CLR_RESET}"
  echo -e "  $(_cmd clawdock-tenant-logs)          ${_CLR_DIM}Ver logs do gateway${_CLR_RESET}"
  echo -e "  $(_cmd clawdock-tenant-status)        ${_CLR_DIM}Status do container${_CLR_RESET}"
  echo -e "  $(_cmd clawdock-tenant-token)         ${_CLR_DIM}Mostra o token do .env${_CLR_RESET}"
  echo -e "  $(_cmd clawdock-tenant-fix-token)     ${_CLR_DIM}Sincroniza token no config${_CLR_RESET}"
  echo -e "\nExemplo de uso:\n  export TENANT_DIR=/opt/openclaw/edgar\n  source /caminho/para/clawdock-helpers-tenant.sh\n  clawdock-tenant-help\n"
}
