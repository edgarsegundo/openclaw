#!/bin/bash
# Lista todos os arquivos .env a partir de um diretório raiz
# e gera linhas de loader para cada um
# Uso: ./list-all-envs-and-loaders.sh /caminho/para/raiz [arquivo_saida]


# Diretório raiz é o diretório atual
RAIZ="$(pwd)"
ARQUIVO_SAIDA="${1:-list-all-envs-and-loaders.md}"

# Lista todos os .env (ignorando node_modules e ocultos)
find "$RAIZ" \
  -type d -name node_modules -prune -o \
  -type d -name ".*" -prune -o \
  -type f -name ".env" -print | sort > /tmp/envs-encontrados.txt

# Mostra lista encontrada
cat /tmp/envs-encontrados.txt


# Comentário de aviso chamativo sobre caminhos absolutos
echo '<!--' > "$ARQUIVO_SAIDA"
echo '  ⚠️⚠️⚠️ ATENÇÃO! ⚠️⚠️⚠️' >> "$ARQUIVO_SAIDA"
echo '' >> "$ARQUIVO_SAIDA"
echo '  O caminho absoluto "/home/ubuntu/openclaw/edgar" pode mudar conforme o ambiente, usuário ou servidor.' >> "$ARQUIVO_SAIDA"
echo '  Sempre verifique e ajuste este prefixo conforme o local onde o projeto está rodando!' >> "$ARQUIVO_SAIDA"
echo '  NÃO confie cegamente neste caminho em scripts de produção ou automações portáveis.' >> "$ARQUIVO_SAIDA"
echo '  Se migrar para outro servidor, usuário ou pasta, atualize todos os caminhos gerados aqui.' >> "$ARQUIVO_SAIDA"
echo '' >> "$ARQUIVO_SAIDA"
echo '  (Este aviso é automático. Consulte a documentação do seu ambiente antes de usar!)' >> "$ARQUIVO_SAIDA"
echo '-->' >> "$ARQUIVO_SAIDA"

echo -e "\n# Linhas para carregar cada .env:\n" >> "$ARQUIVO_SAIDA"
echo '```bash' >> "$ARQUIVO_SAIDA"

while IFS= read -r ENVFILE; do
  # Escreve a linha como texto, sem executar nada
  echo "[ -f '$ENVFILE' ] && export \$(grep -v '^#' '$ENVFILE' | xargs)" >> "$ARQUIVO_SAIDA"
done < /tmp/envs-encontrados.txt

echo '```' >> "$ARQUIVO_SAIDA"

# ─── Seção 2: Variáveis de cada .env (sem valores) ──────────────────────────────
echo -e "\n# Variáveis por .env:\n" >> "$ARQUIVO_SAIDA"

while IFS= read -r ENVFILE; do
  echo "## $ENVFILE" >> "$ARQUIVO_SAIDA"
  echo "" >> "$ARQUIVO_SAIDA"
  echo '```' >> "$ARQUIVO_SAIDA"
  
  # Extrai nomes das variáveis (antes do '='), ignora comentários e linhas vazias
  grep -v '^#' "$ENVFILE" | grep -v '^$' | cut -d '=' -f 1 | sort >> "$ARQUIVO_SAIDA"
  
  echo '```' >> "$ARQUIVO_SAIDA"
  echo "" >> "$ARQUIVO_SAIDA"

done < /tmp/envs-encontrados.txt

sed -i '' 's|/Users/edgar/Repos/openclaw/edgar/|/home/ubuntu/openclaw/edgar/|g' "$ARQUIVO_SAIDA"

echo "\nLinhas de loader e variáveis salvas em: $ARQUIVO_SAIDA"
