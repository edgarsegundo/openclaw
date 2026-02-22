# OpenClaw — Setup com PM2 ou systemd

Guia para rodar o OpenClaw em background no Linux, sobrevivendo a reboots.

> **Pré-requisito:** OpenClaw já instalado via git clone em `/home/ubuntu/openclaw` e build gerado com `pnpm run build`.

---

## Opção 1 — PM2 (recomendado)

### 1. Instalar o PM2

```bash
npm install -g pm2
```

### 2. Criar o arquivo de configuração

Como o `package.json` do OpenClaw usa `"type": "module"`, o arquivo precisa ter a extensão `.cjs`. Crie o arquivo `/home/ubuntu/openclaw/ecosystem.config.cjs`:

```js
module.exports = {
  apps: [
    {
      name: "openclaw",
      script: "/home/ubuntu/openclaw/dist/index.js",
      args: "gateway --bind loopback --port 18789",
      env_file: "/home/ubuntu/openclaw/.env",
      restart_delay: 5000,
      autorestart: true,
    },
  ],
};
```

> **Atenção:** o `.env` deve ter as variáveis no formato `VARIAVEL=valor`, sem o `export`.

### 3. Subir o processo

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

> Se está tentando instalar de novo, precisa limpar tudo:
```bash
pm2 kill
rm -rf ~/.pm2
```

### 4. Registrar no startup do sistema

O comando `pm2 startup` vai gerar um comando personalizado para o seu ambiente. Copie e execute o comando gerado, que terá este formato:

```bash
sudo env PATH=$PATH:/home/ubuntu/.nvm/versions/node/v24.13.1/bin \
  /home/ubuntu/.nvm/versions/node/v24.13.1/lib/node_modules/pm2/bin/pm2 \
  startup systemd -u ubuntu --hp /home/ubuntu
```

Isso garante que o PM2 — e todos os processos salvos — sobem automaticamente no reboot.

### Comandos úteis

```bash
pm2 status              # lista os processos
pm2 logs openclaw       # logs em tempo real
pm2 restart openclaw    # reinicia
pm2 stop openclaw       # para
```

---

## Opção 2 — systemd puro

Crie o arquivo `/etc/systemd/system/openclaw-gateway.service`:

```ini
[Unit]
Description=OpenClaw Gateway (always-on)
After=network-online.target
Wants=network-online.target

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/openclaw
Environment=PATH=/home/ubuntu/.nvm/versions/node/v24.13.1/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
EnvironmentFile=/home/ubuntu/openclaw/.env
ExecStart=/home/ubuntu/.nvm/versions/node/v24.13.1/bin/node /home/ubuntu/openclaw/dist/index.js gateway --bind loopback --port 18789
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Ative o serviço:

```bash
sudo systemctl daemon-reload
sudo systemctl enable openclaw-gateway
sudo systemctl start openclaw-gateway
```

Verifique o status:

```bash
sudo systemctl status openclaw-gateway
```

Acompanhe os logs em tempo real:

```bash
journalctl -u openclaw-gateway -f
```

---

## PM2 vs systemd — quando usar cada um

|                     | PM2               | systemd                    |
| ------------------- | ----------------- | -------------------------- |
| Logs centralizados  | `pm2 logs`        | `journalctl`               |
| Dashboard visual    | `pm2 monit`       | —                          |
| Múltiplos processos | fácil, tudo junto | um `.service` por processo |
| Nativo do Linux     | não               | sim                        |
| Dependência extra   | sim               | não                        |

Se você já usa PM2 para outros projetos no servidor, use PM2. Se quer manter o sistema minimalista sem dependências extras, use systemd.
