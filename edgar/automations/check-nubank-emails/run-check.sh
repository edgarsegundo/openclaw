#!/bin/bash
# Entrar no diretório do projeto
cd ~/openclaw/edgar/automations/check-nubank-emails

# Exportar variáveis do .env de forma segura
set -o allexport
grep -v '^#' .env | sed '/^\s*$/d' | while read line; do eval "export $line"; done
set +o allexport

# Rodar o script Node
/usr/bin/node check-nubank-emails.mjs
