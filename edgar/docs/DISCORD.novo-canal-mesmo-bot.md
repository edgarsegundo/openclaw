# ✅ Checklist — criar novo channel no Discord

## 🎯 Objetivo

Criar um novo canal no Discord (ex: `#fastvistos-visa-crawler`) e preencher as variáveis do `.env` para um novo projeto de automação.

---

# ✅ Regra principal

```text
Novo canal = mesmo bot
Novo produto = novo bot
```

---

# ✅ Passo a passo

## 1) Criar o canal

Servidor → **Text Channels → +**

Nome:

```text
fastvistos-visa-crawler
```

⚠️ sem `#`
⚠️ usar `-`

---

## 2) Dar permissão ao bot

Canal → **Edit Channel → Permissions**

Adicionar:

```text
fastvistos
```

Liberar ✅

- View Channel
- Send Messages
- Read Message History

---

## 3) Criar webhook do canal

Canal → **Edit Channel → Integrations → Webhooks**

Selecionar:

```text
New Webhook
```

Nome sugerido:

```text
visa-crawler
```

Depois:

```text
Copy Webhook URL
```

---

## 4) Pegar o Channel ID

Se precisar usar bot API:

- Ativar **Developer Mode**
- Botão direito no canal
- **Copy Channel ID**

Ou pela URL:

```text
discord.com/channels/SERVER_ID/CHANNEL_ID
```

✅ último número = channel id

---

## 5) Preencher o `.env`

Cada novo projeto deve ter:

```env
YOUR_BOT_TOKEN=
YOUR_CHANNEL_ID=
DISCORD_WEBHOOK_URL=
```

---

## ✅ O que vai em cada campo

### `YOUR_BOT_TOKEN`

Token do bot já existente (mesmo bot pode servir vários canais)

---

### `YOUR_CHANNEL_ID`

ID do canal criado

Exemplo:

```text
1483903374859567215
```

---

### `DISCORD_WEBHOOK_URL`

Webhook criado naquele canal

Exemplo:

```text
https://discord.com/api/webhooks/...
```

---

# ✅ Regra importante

```text
Cada canal tem seu próprio webhook
```

---

# ✅ Sequência mínima

```text
criar canal → dar permissão → criar webhook → preencher .env
```

---

# ✅ Nome ideal do arquivo

```text
checklist-criar-channel-discord-webhook.md
```
