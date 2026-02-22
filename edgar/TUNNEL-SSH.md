# 🚀 Túnel SSH persistente no macOS (com autossh)

https://chatgpt.com/c/6999bd31-43a8-8328-aca2-bddd93e3d106

## 🎯 Objetivo

Criar um túnel:

```
localhost:18789 → servidor:127.0.0.1:18789
```

Que:

* sobe automaticamente
* reconecta se cair
* não pede senha
* roda em background

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

* caminho do autossh
* usuário
* porta
* host

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

* 🔁 reconexão automática
* 🔐 sem senha
* 🔌 sobe no boot
* 🧠 estável
* 🧩 independente de terminal

---

Se quiser, posso te passar uma versão **com múltiplos túneis no mesmo plist** ou um **script que instala tudo automaticamente em 1 comando** 👍
