# 🚀 Túnel SSH persistente no macOS (com autossh)

https://chatgpt.com/c/6999bd31-43a8-8328-aca2-bddd93e3d106

## 🎯 Objetivo

Criar um túnel:

```
localhost:18789 → servidor:127.0.0.1:18789
```

Que:

- sobe automaticamente
- reconecta se cair
- não pede senha
- roda em background

---

# 📦 1. Instalar autossh

Se não tiver:

```bash
brew install autossh
```

Descobrir caminho:

```bash
which autossh
```

👉 Exemplo:

```
/usr/local/bin/autossh   (Intel)
```

ou

```
/opt/homebrew/bin/autossh  (Apple Silicon)
```

⚠️ Guarde esse caminho — você vai usar no plist

---

# 🔐 2. Criar chave SSH (se necessário)

```bash
ssh-keygen -t rsa
```

---

# 📤 3. Enviar chave pro servidor

```bash
ssh-copy-id ubuntu@SEU_IP
```

ou manual:

```bash
cat ~/.ssh/id_rsa.pub | ssh ubuntu@SEU_IP "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

---

# 🧪 4. Testar acesso (OBRIGATÓRIO)

```bash
ssh -i ~/.ssh/id_rsa ubuntu@SEU_IP
```

👉 tem que entrar sem senha

---

# ⚙️ 5. Criar config SSH

Edite:

```bash
nano ~/.ssh/config
```

Adicione:

```
Host tunnel-server
    HostName SEU_IP
    User ubuntu
    IdentityFile ~/.ssh/id_rsa
    IdentitiesOnly yes
    AddKeysToAgent yes
    UseKeychain yes

Host *
    ServerAliveInterval 30
    ServerAliveCountMax 3
```

---

# 🧪 6. Testar alias

```bash
ssh tunnel-server
```

👉 deve entrar sem senha

---

# 🧠 7. Testar túnel manual

```bash
autossh -M 0 -N -L 18789:127.0.0.1:18789 tunnel-server
```

Outro terminal:

```bash
lsof -i :18789
```

👉 deve aparecer LISTEN

---

# 📄 8. Criar LaunchAgent

```bash
nano ~/Library/LaunchAgents/com.ssh.tunnel.plist
```

---

## 📌 Conteúdo do plist

⚠️ Ajuste:

- caminho do autossh
- usuário
- porta
- host

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
 "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>

  <key>Label</key>
  <string>com.ssh.tunnel</string>

  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/autossh</string>

    <string>-M</string>
    <string>0</string>

    <string>-N</string>

    <string>-i</string>
    <string>/Users/SEU_USUARIO/.ssh/id_rsa</string>

    <string>-o</string>
    <string>StrictHostKeyChecking=no</string>

    <string>-o</string>
    <string>ServerAliveInterval=30</string>

    <string>-o</string>
    <string>ServerAliveCountMax=3</string>

    <string>-L</string>
    <string>18789:127.0.0.1:18789</string>

    <string>tunnel-server</string>
  </array>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>

  <key>ThrottleInterval</key>
  <integer>10</integer>

  <key>EnvironmentVariables</key>
  <dict>
    <key>AUTOSSH_GATETIME</key>
    <string>0</string>

    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>

  <key>StandardOutPath</key>
  <string>/tmp/ssh-tunnel.log</string>

  <key>StandardErrorPath</key>
  <string>/tmp/ssh-tunnel.err</string>

</dict>
</plist>
```

---

# 🔄 9. Ativar

```bash
launchctl unload ~/Library/LaunchAgents/com.ssh.tunnel.plist 2>/dev/null
launchctl load ~/Library/LaunchAgents/com.ssh.tunnel.plist
launchctl start com.ssh.tunnel
```

---

# 🔍 10. Validar

```bash
lsof -i :18789
```

👉 esperado:

```
ssh ... LISTEN localhost:18789
```

---

# 🌐 11. Usar

```bash
http://127.0.0.1:18789
```

---

# 🔧 Comandos úteis

### ver logs

```bash
tail -f /tmp/ssh-tunnel.err
```

### parar

```bash
launchctl unload ~/Library/LaunchAgents/com.ssh.tunnel.plist
```

### iniciar

```bash
launchctl load ~/Library/LaunchAgents/com.ssh.tunnel.plist
```

---

# ⚠️ Problemas comuns

## ❌ Permission denied

→ chave não configurada

## ❌ Porta não abre

→ serviço remoto não existe

## ❌ autossh não roda

→ PATH ou caminho errado

---

# 💪 Resultado final

- 🔁 reconexão automática
- 🔐 sem senha
- 🔌 sobe no boot
- 🧠 estável
- 🧩 independente de terminal

---

Se quiser, posso te passar uma versão **com múltiplos túneis no mesmo plist** ou um **script que instala tudo automaticamente em 1 comando** 👍

---

---

# 🆕 Adicionar um NOVO Dashboard + Túnel

Use isso sempre que for criar um novo dashboard (sem refazer o setup inicial de SSH/chaves, que já está feito acima).

## 🧠 Checklist rápido (copy-paste mental)

Sempre que criar dashboard novo:

- [ ] PM2 start no servidor
- [ ] curl funcionando no servidor
- [ ] autossh manual funcionando no Mac
- [ ] copiar plist existente
- [ ] trocar: nome (Label), porta (-L), logs
- [ ] launchctl load
- [ ] testar curl local

## 💡 Regra de ouro

> Se mudar só **3 coisas** corretamente — **nome, porta e logs** — todo o resto já funciona.

---

## 1. 🔥 No servidor (PM2)

### 1.1 Entrar no projeto

```bash
cd ~/Repos/openclaw/edgar/automations/cron-manager
```

### 1.2 Subir o novo dashboard

```bash
pm2 start apps/<novo-dashboard>/server.js --name <nome-do-dashboard>
```

Exemplo:

```bash
pm2 start apps/pipeline-dashboard/server.js --name pipeline-dashboard
```

### 1.3 Salvar processos

```bash
pm2 save
```

### 1.4 Confirmar que está rodando

```bash
pm2 status
```

### 1.5 Testar localmente no servidor

```bash
curl http://127.0.0.1:<PORTA>/api/groups
```

Exemplo:

```bash
curl http://127.0.0.1:4500/api/groups
```

✔ Se responder JSON → OK
❌ Se não responder → corrigir antes de continuar

---

## 2. 🌐 No Mac (Túnel SSH)

### 2.1 Teste manual (sempre antes do automático)

```bash
autossh -M 0 -N -L <PORTA>:127.0.0.1:<PORTA> tunnel-server
```

Exemplo:

```bash
autossh -M 0 -N -L 4500:127.0.0.1:4500 tunnel-server
```

### 2.2 Testar acesso

```bash
curl http://127.0.0.1:<PORTA>
```

ou navegador:

```
http://127.0.0.1:<PORTA>
```

---

## 3. ⚙️ Criar novo LaunchAgent (AUTOSTART)

### 3.1 Copiar um existente (recomendado)

```bash
cp ~/Library/LaunchAgents/com.ssh.tunnel.plist \
   ~/Library/LaunchAgents/com.ssh.<nome>.plist
```

Exemplo:

```bash
cp ~/Library/LaunchAgents/com.ssh.tunnel.plist \
   ~/Library/LaunchAgents/com.ssh.pipeline-dashboard.plist
```

### 3.2 O que SEMPRE mudar no plist

**🔴 1. Label**

```xml
<key>Label</key>
<string>com.ssh.<nome></string>
```

**🔴 2. Porta do túnel**

```xml
<string>-L</string>
<string><PORTA>:127.0.0.1:<PORTA></string>
```

Exemplo:

```xml
<string>-L</string>
<string>4500:127.0.0.1:4500</string>
```

**🔴 3. Logs (IMPORTANTE separar por dashboard)**

```xml
<key>StandardOutPath</key>
<string>/tmp/<nome>.log</string>

<key>StandardErrorPath</key>
<string>/tmp/<nome>.err</string>
```

> ⚠️ Não esqueça: se você não trocar o Label e os caminhos de log, o novo plist vai **conflitar ou sobrescrever** o túnel antigo.

---

## 4. 🚀 Ativar o túnel

```bash
launchctl unload ~/Library/LaunchAgents/com.ssh.<nome>.plist 2>/dev/null
launchctl load ~/Library/LaunchAgents/com.ssh.<nome>.plist
launchctl start com.ssh.<nome>
```

---

## 5. 🔍 Verificação final

### 5.1 Ver processo SSH

```bash
lsof -i :<PORTA>
```

### 5.2 Testar endpoint

```bash
curl http://127.0.0.1:<PORTA>/api/groups
```

---

## 6. 📋 Tabela de dashboards ativos

Mantenha essa tabela atualizada aqui no documento — facilita lembrar portas já usadas e evitar conflito.

| Dashboard          | Porta | Label (plist)              | Pasta no servidor (apps/) | PM2 name           |
| ------------------ | ----- | -------------------------- | ------------------------- | ------------------ |
| tunnel (base)      | 18789 | com.ssh.tunnel             | —                         | —                  |
| pipeline-dashboard | 4500  | com.ssh.pipeline-dashboard | apps/pipeline-dashboard   | pipeline-dashboard |
| _novo aqui_        |       |                            |                           |                    |

---

## 7. 🛠️ Script auxiliar (opcional, recomendado)

Se quiser automatizar os passos 3 e 4 (copiar plist + trocar nome/porta/logs + ativar) em **um único comando**, posso gerar um script `new-dashboard-tunnel.sh` que recebe `nome` e `porta` como argumentos e faz tudo isso sozinho. Só pedir.
