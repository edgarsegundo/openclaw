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

echo -e "\n# Linhas para carregar cada .env:\n" > "$ARQUIVO_SAIDA"
echo '```bash' >> "$ARQUIVO_SAIDA"

while IFS= read -r ENVFILE; do
  # Escreve a linha como texto, sem executar nada
  echo "[ -f '$ENVFILE' ] && export \$(grep -v '^#' '$ENVFILE' | xargs)" >> "$ARQUIVO_SAIDA"
done < /tmp/envs-encontrados.txt

echo '```' >> "$ARQUIVO_SAIDA"

echo "\nLinhas de loader salvas em: $ARQUIVO_SAIDA"
