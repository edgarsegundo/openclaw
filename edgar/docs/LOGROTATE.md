# 🧰 Setup completo de logs para cron (produção)

## 🎯 Objetivo

- Evitar crescimento infinito do log
- Ter rotação automática

---

# 1️⃣ Criar o arquivo de logrotate

```
sudo nano /etc/logrotate.d/nome-do-projeto
```

---

# 2️⃣ Configurar logrotate

```
/caminho/do/projeto/cron.log {
    su ubuntu ubuntu
    daily
    maxsize 10M
    rotate 7
    compress
    missingok
    notifempty
    copytruncate
}
```

---

# 3️⃣ Explicação rápida

- `su ubuntu ubuntu` → resolve problema de permissão
- `daily` → roda todo dia
- `maxsize 10M` → roda antes se passar de 10MB
- `rotate 7` → guarda 7 arquivos antigos
- `compress` → compacta logs antigos
- `copytruncate` → zera log sem parar o script
- `missingok` → não dá erro se não existir
- `notifempty` → não roda se vazio

---

# 4️⃣ Testar configuração

### 🔍 Modo debug (não altera nada)

```
sudo logrotate -d /etc/logrotate.d/nome-do-projeto
```

---

### 🔄 Forçar rotação

```
sudo logrotate -f /etc/logrotate.d/nome-do-projeto
```

---

# 5️⃣ Validar resultado

```
ls -lh /caminho/do/projeto/
```

Você deve ver:

```
cron.log
cron.log.1.gz
```

---

# 6️⃣ Criar symlink (organização)

Para lembrar onde está a config:

```
ln -s /etc/logrotate.d/nome-do-projeto /caminho/do/projeto/logrotate.conf
```

---

# 7️⃣ Testar manualmente o log

```
echo "teste de erro" >> /caminho/do/projeto/cron.log
sudo logrotate -f /etc/logrotate.d/nome-do-projeto
```

Ver conteúdo:

```
zcat cron.log.1.gz
```

---

# 8️⃣ Verificar execução automática

O logrotate roda automaticamente via:

```
/etc/cron.daily/logrotate
```

---

# ✅ Resultado final

Você terá:

- ✔️ Cron rodando corretamente
- ✔️ Log só com erros
- ✔️ Rotação automática
- ✔️ Logs comprimidos
- ✔️ Sem crescimento infinito

---

# ⚠️ Boas práticas

- Sempre usar **caminho absoluto**
- Nunca usar `~` no logrotate
- Usar `su` se estiver em `/home`
- Evitar logar tudo (prefira só erros)

---

# 💡 Template rápido (copiar e usar)

### Cron

```
0 7-20 * * 1-6 /path/script.sh > /dev/null 2>> /path/cron.log
```

### Logrotate

```
/path/cron.log {
    su USER USER
    daily
    maxsize 10M
    rotate 7
    compress
    missingok
    notifempty
    copytruncate
}
```

---

Se quiser, posso te montar uma versão **ainda mais avançada** (com alerta automático quando der erro) 👍
