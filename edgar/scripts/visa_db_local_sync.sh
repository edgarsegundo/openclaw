#!/bin/bash

REMOTE_USER="ubuntu"
REMOTE_HOST="72.60.57.150"
SSH_KEY="$HOME/.ssh/id_rsa"
REMOTE_FILE="/home/ubuntu/openclaw/edgar/automations/visa-crawler/visa-crawler.db"
LOCAL_FILE="$HOME/Repos/openclaw/edgar/automations/visa-crawler/visa-crawler.db"

echo "Copiando arquivo do VPS..."

scp -i "$SSH_KEY" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_FILE" "$LOCAL_FILE"

if [ $? -eq 0 ]; then
    echo "✅ Arquivo atualizado em: $LOCAL_FILE"
else
    echo "❌ Erro ao copiar arquivo"
fi
