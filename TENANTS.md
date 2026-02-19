# OpenClaw — Guia de Multitenancy

Este guia explica como configurar e gerenciar múltiplos tenants do OpenClaw num único servidor usando Docker.

## Estrutura de diretórios

Cada tenant tem seu próprio diretório isolado em `/opt/openclaw/<client_id>`:

```
/opt/openclaw/
├── cliente1/
│   ├── state/      # Estado interno do OpenClaw (sessões, memória, logs, openclaw.json)
│   ├── workspace/  # Arquivos gerados pelo agente durante tarefas
│   └── home/       # Home do container (cache do navegador, downloads, arquivos temporários)
├── cliente2/
│   ├── state/
│   ├── workspace/
│   └── home/
```

---

## Primeiro uso — preparação do servidor

Antes de criar qualquer tenant, prepare o diretório base **uma única vez**:

```bash
sudo mkdir -p /opt/openclaw
sudo chown -R ubuntu:ubuntu /opt/openclaw
```

Isso garante que o usuário `ubuntu` possa criar e gerenciar tenants sem precisar de `sudo` toda vez.

---

## Criando um novo tenant

### 1. Crie o arquivo `.env` do tenant

Crie o diretório e o `.env` com as configurações do tenant:

```bash
mkdir -p /opt/openclaw/<client_id>
nano /opt/openclaw/<client_id>/.env
```

Use o template abaixo como base (veja a seção [Referência do .env](#referência-do-env) para detalhes de cada variável).

### 2. Rode o script de setup

```bash
cd /home/ubuntu/openclaw
./docker-setup-tenant.sh <client_id>
```

O script vai:
- Criar os diretórios `state/`, `workspace/` e `home/` se não existirem
- Carregar o `.env` do tenant e respeitar os valores já definidos
- Fazer o build da imagem Docker
- Rodar o onboarding interativo
- Subir o gateway

### 3. Durante o onboarding, responda:

```
Gateway bind:            lan
Gateway auth:            token
Gateway token:           <valor do OPENCLAW_GATEWAY_TOKEN no .env>
Tailscale exposure:      Off
Install Gateway daemon:  No
```

---

## Múltiplos tenants — portas

Cada tenant deve usar portas diferentes para evitar conflito. Defina no `.env` de cada tenant:

| Tenant    | OPENCLAW_GATEWAY_PORT | OPENCLAW_BRIDGE_PORT |
|-----------|-----------------------|----------------------|
| edgar     | 18789                 | 18790                |
| cliente2  | 18791                 | 18792                |
| cliente3  | 18793                 | 18794                |

---

## Comandos úteis por tenant

Substitua `<client_id>` pelo ID do tenant e ajuste os caminhos conforme necessário.

```bash
# Ver logs do gateway
docker compose --env-file /opt/openclaw/<client_id>/.env logs -f openclaw-gateway

# Verificar saúde do gateway
docker compose --env-file /opt/openclaw/<client_id>/.env exec openclaw-gateway \
  node dist/index.js health --token "<OPENCLAW_GATEWAY_TOKEN>"

# Parar o gateway
docker compose --env-file /opt/openclaw/<client_id>/.env down

# Adicionar canal Telegram
docker compose --env-file /opt/openclaw/<client_id>/.env run --rm openclaw-cli \
  channels add --channel telegram --token <bot_token>
```

---

## Referência do `.env`

Abaixo o template completo comentado. Copie, ajuste e salve em `/opt/openclaw/<client_id>/.env`.

```env
# ----------------------------------------
# 🏠 Tenant
# ----------------------------------------
CLIENT_ID=edgar

# ----------------------------------------
# 🔑 Gateway Auth + Paths
# ----------------------------------------

# Token secreto para autenticação do OpenClaw Gateway.
# Gerado automaticamente pelo script se não estiver definido.
OPENCLAW_GATEWAY_TOKEN=

# Alternativa via senha (use apenas se não usar token)
# OPENCLAW_GATEWAY_PASSWORD=change-me-to-a-strong-password

# Diretório onde o OpenClaw salva estado interno: sessões, memória, logs e openclaw.json.
OPENCLAW_STATE_DIR=/opt/openclaw/edgar/state

# Caminho do arquivo de configuração detalhada do OpenClaw.
OPENCLAW_CONFIG_PATH=/opt/openclaw/edgar/state/openclaw.json

# Diretório base do tenant no host.
OPENCLAW_HOME=/opt/openclaw/edgar

# Carrega variáveis do ambiente do shell do container ao iniciar.
# Útil quando você usa scripts de inicialização (ex: /etc/profile.d/, ~/.bashrc)
# que definem variáveis dinamicamente — por exemplo, tokens gerados em runtime,
# paths calculados, ou integração com sistemas como Vault/AWS Secrets Manager.
# No Docker com .env explícito, não tem utilidade — deixe 0 ou remova.
OPENCLAW_LOAD_SHELL_ENV=1
OPENCLAW_SHELL_ENV_TIMEOUT_MS=15000

# ----------------------------------------
# 💬 Channels / Bots
# ----------------------------------------

# Telegram
TELEGRAM_BOT_TOKEN=

# Discord
#DISCORD_BOT_TOKEN=...

# Slack
#SLACK_BOT_TOKEN=xoxb-...
#SLACK_APP_TOKEN=xapp-...

# Twitch
#OPENCLAW_TWITCH_ACCESS_TOKEN=oauth:...

# Mattermost
#MATTERMOST_BOT_TOKEN=...
#MATTERMOST_URL=https://chat.example.com

# Zalo
#ZALO_BOT_TOKEN=...

# ----------------------------------------
# 🛠 Tools + Voice / Media
# ----------------------------------------

# Navegação / Pesquisa
#BRAVE_API_KEY=...
#PERPLEXITY_API_KEY=pplx-...
#FIRECRAWL_API_KEY=...

# Voz / Texto para fala
#ELEVENLABS_API_KEY=...
#XI_API_KEY=...  # alias para ElevenLabs

# Transcrição de áudio
#DEEPGRAM_API_KEY=...

# ----------------------------------------
# ⚙ Docker / Full-featured options (power-user)
# ----------------------------------------

# Mapeia o diretório home do container (/home/node) para o host, persistindo
# caches, downloads e arquivos temporários gerados pelo ambiente Linux do container
# entre restarts. Diferente do OPENCLAW_STATE_DIR, que persiste apenas os dados
# internos do OpenClaw (sessões, memória, logs), este volume persiste tudo que
# o sistema operacional do container gera — como perfis de navegador, caches do
# npm e arquivos temporários. Com OPENCLAW_HOME_VOLUME=/opt/openclaw/edgar/home,
# esses dados sobrevivem aos restarts — o benefício prático mais comum é o browser
# control não precisar recriar o perfil do navegador do zero a cada restart, o que
# é mais rápido e mantém cookies e sessões ativas.
# A estrutura completa do tenant:
#   /opt/openclaw/edgar/
#   ├── state/       # OPENCLAW_STATE_DIR
#   ├── workspace/   # OPENCLAW_WORKSPACE_DIR
#   └── home/        # OPENCLAW_HOME_VOLUME
OPENCLAW_HOME_VOLUME=/opt/openclaw/edgar/home

# Pacotes adicionais instalados no container durante o build.
# Exemplos: git, curl, ffmpeg, jq, imagemagick
OPENCLAW_DOCKER_APT_PACKAGES="build-essential ffmpeg curl jq"

# OBS: Se quiser usar navegadores (Playwright / Chromium), depois rode:
# docker compose --env-file /opt/openclaw/edgar/.env run --rm openclaw-cli \
#   node /app/node_modules/playwright-core/cli.js install chromium

# Monta o OPENCLAW_STATE_DIR no caminho esperado pelo docker-compose.
OPENCLAW_CONFIG_DIR=${OPENCLAW_STATE_DIR}

# Diretório de trabalho do agente — arquivos gerados durante tarefas.
OPENCLAW_WORKSPACE_DIR=/opt/openclaw/edgar/workspace

# Porta do gateway WebSocket — deve ser única por tenant.
OPENCLAW_GATEWAY_PORT=18789

# Porta da bridge — deve ser única por tenant.
OPENCLAW_BRIDGE_PORT=18790

# Bind do gateway: lan (acessível externamente) ou loopback (apenas local).
OPENCLAW_GATEWAY_BIND=lan

# Nome da imagem Docker a usar.
OPENCLAW_IMAGE=openclaw:local

# Mounts extras no container, separados por vírgula.
# Exemplo: /mnt/dados:/dados,/mnt/backup:/backup
OPENCLAW_EXTRA_MOUNTS=

# UID e GID do usuário que roda o container.
# Use `id -u` e `id -g` para obter os valores do seu usuário.
OPENCLAW_UID=1000
OPENCLAW_GID=1000
```
