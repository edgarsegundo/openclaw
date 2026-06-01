# README

## Como testar api/visa

curl http://localhost:3099/api/visa/ca
curl http://localhost:3099/api/visa-countries

## Rodando a API com PM2

1. Instale o PM2 (se ainda não tiver):

   ```bash
   sudo npm install -g pm2
   ```

2. Crie o arquivo `ecosystem.config.js` (já incluso neste projeto) para carregar variáveis do `.env` automaticamente.

3. Execute:

   ```bash
   npm install
   ```

4. Inicie a API em background usando o arquivo de configuração:

   ```bash
   pm2 start ecosystem.config.js
   ```

5. Salve o processo para reiniciar automaticamente após reboot:

   ```bash
   pm2 save
   pm2 startup
   # Siga a instrução do comando acima para ativar no boot
   ```

6. Comandos úteis:
   ```bash
   pm2 status         # Ver status dos apps
   pm2 logs visa-api  # Ver logs em tempo real
   pm2 restart visa-api  # Reiniciar a API
   pm2 stop visa-api     # Parar a API
   ```

## How to run locally?

```bash
cd /Users/edgar/Repos/openclaw/edgar/api & npm run start
```
