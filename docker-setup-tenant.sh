#!/usr/bin/env bash
set -euo pipefail

# ----------------------------------------
# 🏠 Tenant Setup Script for OpenClaw
# Usage: ./docker-setup-tenant.sh <client_id>
# Example: ./docker-setup-tenant.sh edgar
# ----------------------------------------

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLIENT_ID="${1:-}"

if [ -z "$CLIENT_ID" ]; then
  echo "Uso: ./docker-setup-tenant.sh <client_id>" >&2
  echo "Exemplo: ./docker-setup-tenant.sh edgar" >&2
  exit 1
fi

TENANT_DIR="/opt/openclaw/${CLIENT_ID}"
ENV_FILE="${TENANT_DIR}/.env"
COMPOSE_FILE="$ROOT_DIR/docker-compose.yml"
EXTRA_COMPOSE_FILE="${TENANT_DIR}/docker-compose.extra.yml"
IMAGE_NAME="${OPENCLAW_IMAGE:-openclaw:local}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing dependency: $1" >&2
    exit 1
  fi
}

require_cmd docker
if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose not available (try: docker compose version)" >&2
  exit 1
fi

# ----------------------------------------
# 📁 Criar diretórios do tenant
# ----------------------------------------
echo "==> Criando diretórios para tenant: $CLIENT_ID"
mkdir -p "${TENANT_DIR}/state"
mkdir -p "${TENANT_DIR}/workspace"
mkdir -p "${TENANT_DIR}/home"

OPENCLAW_UID=$(id -u)
OPENCLAW_GID=$(id -g)
for dir in "${TENANT_DIR}/state" "${TENANT_DIR}/workspace" "${TENANT_DIR}/home"; do
  if [[ ! -d "$dir" ]]; then
    mkdir -p "$dir"
    chown "${OPENCLAW_UID}:${OPENCLAW_GID}" "$dir"
  fi
done

# ----------------------------------------
# 🔑 Gerar token se não existir
# ----------------------------------------
if [[ -f "$ENV_FILE" ]]; then
  # Carrega variáveis existentes do tenant
  set -o allexport
  source "$ENV_FILE"
  set +o allexport
fi

if [[ -z "${OPENCLAW_GATEWAY_TOKEN:-}" ]]; then
  if command -v openssl >/dev/null 2>&1; then
    OPENCLAW_GATEWAY_TOKEN="$(openssl rand -hex 32)"
  else
    OPENCLAW_GATEWAY_TOKEN="$(python3 - <<'PY'
import secrets
print(secrets.token_hex(32))
PY
)"
  fi
fi

# ----------------------------------------
# ⚙️ Configurações do tenant
# Usa valor do .env se existir, senão aplica default baseado no TENANT_DIR
# ----------------------------------------
OPENCLAW_GATEWAY_PORT="${OPENCLAW_GATEWAY_PORT:-18789}"
OPENCLAW_BRIDGE_PORT="${OPENCLAW_BRIDGE_PORT:-18790}"
OPENCLAW_GATEWAY_BIND="${OPENCLAW_GATEWAY_BIND:-lan}"
OPENCLAW_CONFIG_DIR="${OPENCLAW_CONFIG_DIR:-${TENANT_DIR}/state}"
OPENCLAW_WORKSPACE_DIR="${OPENCLAW_WORKSPACE_DIR:-${TENANT_DIR}/workspace}"
OPENCLAW_HOME_VOLUME="${OPENCLAW_HOME_VOLUME:-${TENANT_DIR}/home}"
OPENCLAW_DOCKER_APT_PACKAGES="${OPENCLAW_DOCKER_APT_PACKAGES:-}"
OPENCLAW_EXTRA_MOUNTS="${OPENCLAW_EXTRA_MOUNTS:-}"

# ----------------------------------------
# 💾 Criar/atualizar .env do tenant
# ----------------------------------------
echo "==> Escrevendo configuração em: $ENV_FILE"

upsert_env() {
  local file="$1"
  shift
  local -a keys=("$@")
  local tmp
  tmp="$(mktemp)"
  local seen=" "

  if [[ -f "$file" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
      local key="${line%%=*}"
      local replaced=false
      for k in "${keys[@]}"; do
        if [[ "$key" == "$k" ]]; then
          printf '%s="%s"\n' "$k" "${!k-}" >>"$tmp"
          seen="$seen$k "
          replaced=true
          break
        fi
      done
      if [[ "$replaced" == false ]]; then
        printf '%s\n' "$line" >>"$tmp"
      fi
    done <"$file"
  fi

  for k in "${keys[@]}"; do
    if [[ "$seen" != *" $k "* ]]; then
      printf '%s="%s"\n' "$k" "${!k-}" >>"$tmp"
    fi
  done

  mv "$tmp" "$file"
}

upsert_env "$ENV_FILE" \
  CLIENT_ID \
  OPENCLAW_IMAGE \
  OPENCLAW_UID \
  OPENCLAW_GID \
  OPENCLAW_GATEWAY_TOKEN \
  OPENCLAW_GATEWAY_PORT \
  OPENCLAW_BRIDGE_PORT \
  OPENCLAW_GATEWAY_BIND \
  OPENCLAW_CONFIG_DIR \
  OPENCLAW_WORKSPACE_DIR \
  OPENCLAW_HOME_VOLUME \
  OPENCLAW_DOCKER_APT_PACKAGES \
  OPENCLAW_EXTRA_MOUNTS

# ----------------------------------------
# 📦 Extra compose (home volume + mounts extras)
# ----------------------------------------
COMPOSE_FILES=("$COMPOSE_FILE")
COMPOSE_ARGS=()

write_extra_compose() {
  local home_volume="$1"
  shift
  local mount

  cat >"$EXTRA_COMPOSE_FILE" <<YAML
services:
  openclaw-gateway:
    volumes:
YAML

  if [[ -n "$home_volume" ]]; then
    printf '      - %s:/home/node\n' "$home_volume" >>"$EXTRA_COMPOSE_FILE"
    printf '      - %s:/home/node/.openclaw\n' "$OPENCLAW_CONFIG_DIR" >>"$EXTRA_COMPOSE_FILE"
    printf '      - %s:/home/node/.openclaw/workspace\n' "$OPENCLAW_WORKSPACE_DIR" >>"$EXTRA_COMPOSE_FILE"
  fi

  for mount in "$@"; do
    printf '      - %s\n' "$mount" >>"$EXTRA_COMPOSE_FILE"
  done

  cat >>"$EXTRA_COMPOSE_FILE" <<YAML
  openclaw-cli:
    volumes:
YAML

  if [[ -n "$home_volume" ]]; then
    printf '      - %s:/home/node\n' "$home_volume" >>"$EXTRA_COMPOSE_FILE"
    printf '      - %s:/home/node/.openclaw\n' "$OPENCLAW_CONFIG_DIR" >>"$EXTRA_COMPOSE_FILE"
    printf '      - %s:/home/node/.openclaw/workspace\n' "$OPENCLAW_WORKSPACE_DIR" >>"$EXTRA_COMPOSE_FILE"
  fi

  for mount in "$@"; do
    printf '      - %s\n' "$mount" >>"$EXTRA_COMPOSE_FILE"
  done
}

VALID_MOUNTS=()
if [[ -n "$OPENCLAW_EXTRA_MOUNTS" ]]; then
  IFS=',' read -r -a mounts <<<"$OPENCLAW_EXTRA_MOUNTS"
  for mount in "${mounts[@]}"; do
    mount="${mount#"${mount%%[![:space:]]*}"}"
    mount="${mount%"${mount##*[![:space:]]}"}"
    if [[ -n "$mount" ]]; then
      VALID_MOUNTS+=("$mount")
    fi
  done
fi

if [[ -n "$OPENCLAW_HOME_VOLUME" || ${#VALID_MOUNTS[@]} -gt 0 ]]; then
  if [[ ${#VALID_MOUNTS[@]} -gt 0 ]]; then
    write_extra_compose "$OPENCLAW_HOME_VOLUME" "${VALID_MOUNTS[@]}"
  else
    write_extra_compose "$OPENCLAW_HOME_VOLUME"
  fi
  COMPOSE_FILES+=("$EXTRA_COMPOSE_FILE")
fi

for compose_file in "${COMPOSE_FILES[@]}"; do
  COMPOSE_ARGS+=("-f" "$compose_file")
done

COMPOSE_HINT="docker compose --env-file ${ENV_FILE}"
for compose_file in "${COMPOSE_FILES[@]}"; do
  COMPOSE_HINT+=" -f ${compose_file}"
done

# ----------------------------------------
# 🐳 Build da imagem
# ----------------------------------------
echo ""
echo "==> Building Docker image: $IMAGE_NAME"
docker build \
  --build-arg "OPENCLAW_DOCKER_APT_PACKAGES=${OPENCLAW_DOCKER_APT_PACKAGES}" \
  -t "$IMAGE_NAME" \
  -f "$ROOT_DIR/Dockerfile" \
  "$ROOT_DIR"

# ----------------------------------------
# 🚀 Onboarding
# ----------------------------------------
echo ""
echo "==> Onboarding tenant: $CLIENT_ID (interactive)"
echo "When prompted:"
echo "  - Gateway bind: lan"
echo "  - Gateway auth: token"
echo "  - Gateway token: $OPENCLAW_GATEWAY_TOKEN"
echo "  - Tailscale exposure: Off"
echo "  - Install Gateway daemon: No"
echo ""
if [[ "${SKIP_ONBOARD:-0}" != "1" ]]; then
  docker compose --env-file "$ENV_FILE" "${COMPOSE_ARGS[@]}" run --rm openclaw-cli onboard --no-install-daemon
fi

# ----------------------------------------
# 📡 Canais (opcional)
# ----------------------------------------
echo ""
echo "==> Provider setup (opcional)"
echo "Telegram (bot token):"
echo "  ${COMPOSE_HINT} run --rm openclaw-cli channels add --channel telegram --token <token>"
echo "WhatsApp (QR):"
echo "  ${COMPOSE_HINT} run --rm openclaw-cli channels login"
echo "Discord (bot token):"
echo "  ${COMPOSE_HINT} run --rm openclaw-cli channels add --channel discord --token <token>"
echo "Docs: https://docs.openclaw.ai/channels"

# ----------------------------------------
# ▶️ Start gateway
# ----------------------------------------
echo ""
echo "==> Starting gateway for tenant: $CLIENT_ID"
docker compose --env-file "$ENV_FILE" "${COMPOSE_ARGS[@]}" up -d openclaw-gateway

# ----------------------------------------
# ✅ Resumo
# ----------------------------------------
echo ""
echo "======================================"
echo "✅ Tenant '$CLIENT_ID' configurado!"
echo "======================================"
echo "Diretório:  ${TENANT_DIR}"
echo "Config:     ${OPENCLAW_CONFIG_DIR}"
echo "Workspace:  ${OPENCLAW_WORKSPACE_DIR}"
echo "Home:       ${OPENCLAW_HOME_VOLUME}"
echo "Gateway:    http://0.0.0.0:${OPENCLAW_GATEWAY_PORT}"
echo "Token:      ${OPENCLAW_GATEWAY_TOKEN}"
echo ""
echo "Comandos úteis:"
echo "  ${COMPOSE_HINT} logs -f openclaw-gateway"
echo "  ${COMPOSE_HINT} exec openclaw-gateway node dist/index.js health --token \"$OPENCLAW_GATEWAY_TOKEN\""
echo "  ${COMPOSE_HINT} down"
echo ""
echo "⚠️  Se adicionar outro tenant, use portas diferentes:"
echo "  OPENCLAW_GATEWAY_PORT=18791 OPENCLAW_BRIDGE_PORT=18792 ./docker-setup-tenant.sh outro-cliente"
