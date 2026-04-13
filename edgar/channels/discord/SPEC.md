# Discord Multi-Bot Command Listener — Spec (Final)

---

## 🎯 Objetivo

Criar um serviço em Node.js que:

* Escuta mensagens de **múltiplos bots** do Discord (cada um com seu token)
* Interpreta comandos digitados pelo usuário (ex: `/pub 1`)
* Dispara ações no backend (API, scripts, automações)
* Suporta múltiplos comandos, múltiplos canais e múltiplos bots
* Centraliza a lógica de comandos e facilita manutenção/escalabilidade

---

## 🧠 Conceito da Arquitetura

A arquitetura é baseada em:

* **Comandos** (não canais)
* **Multi-bot**
* **Dispatcher central**

### Fluxo:

```text
Usuário digita mensagem no Discord
↓
Um dos bots recebe evento (messageCreate)
↓
Dispatcher identifica comando (/pub)
↓
Handler executa lógica (com contexto do bot)
↓
Sistema dispara ações (API, jobs, etc)
```

---

## 🏗️ Estrutura de Pastas

```text
/channels
  /discord
    index.js
    dispatcher.js
    bots.config.js
    /commands
      pub.js
```

---

## ⚙️ Setup Inicial

### 1. Criar estrutura

```bash
mkdir -p channels/discord/commands
cd channels/discord
npm init -y
```

---

### 2. Instalar dependências

```bash
npm install discord.js dotenv node-fetch
```

---

### 3. Criar `.env`

```env
BOT1_TOKEN=SEU_TOKEN_DISCORD_1
BOT1_CHANNEL_ID=ID_CANAL_1 (opcional)

BOT2_TOKEN=SEU_TOKEN_DISCORD_2
BOT2_CHANNEL_ID=ID_CANAL_2 (opcional)

API_URL=http://localhost:3001/api
COMMAND_PREFIX=/
```

---

## 🤖 Configuração de Bots

### 📄 `bots.config.js`

```js
module.exports = [
  {
    name: "Bot1",
    token: process.env.BOT1_TOKEN,
    channelId: process.env.BOT1_CHANNEL_ID,
  },
  {
    name: "Bot2",
    token: process.env.BOT2_TOKEN,
    channelId: process.env.BOT2_CHANNEL_ID,
  },
];
```

---

## 🔌 Implementação

---

### 📄 `index.js` — Bootstrap multi-bot

```js
require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const { dispatch } = require("./dispatcher");
const bots = require("./bots.config");

const clients = [];

bots.forEach(({ token, name, channelId }) => {
  if (!token) {
    throw new Error(`❌ Token não definido para ${name}`);
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  clients.push({ name, client });

  client.on("ready", () => {
    console.log(`✅ ${name} online: ${client.user.tag}`);
  });

  client.on("messageCreate", async (message) => {
    try {
      if (message.author.bot) return;

      if (channelId && message.channel.id !== channelId) return;

      await dispatch(message, {
        botName: name,
        client,
      });
    } catch (err) {
      console.error(`[${name}] Erro:`, err);
    }
  });

  client.login(token);
});
```

---

### 📄 `dispatcher.js` — Roteador dinâmico

```js
const fs = require("fs");
const path = require("path");

const commands = {};
const prefix = process.env.COMMAND_PREFIX || "/";

// auto-load de comandos
const files = fs.readdirSync(path.join(__dirname, "commands"));

files.forEach((file) => {
  const command = require(`./commands/${file}`);
  commands[command.name] = command;
});

async function dispatch(message, context = {}) {
  const content = message.content.trim();

  if (!content.startsWith(prefix)) return;

  const [commandName, ...args] = content.split(" ");
  const command = commands[commandName];

  if (!command) {
    return message.reply("❌ Comando não reconhecido");
  }

  await command.execute({
    message,
    args,
    ...context,
  });
}

module.exports = { dispatch };
```

---

### 📄 `commands/pub.js` — Comando exemplo

```js
const fetch = require("node-fetch");

module.exports = {
  name: "/pub",
  description: "Publica artigo por índice",

  async execute({ message, args, botName }) {
    const index = args[0];

    if (!index) {
      return message.reply("❌ Informe o índice. Ex: /pub 1");
    }

    try {
      console.log(JSON.stringify({
        bot: botName,
        event: "pub_command",
        index,
      }));

      // timeout simples
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      await fetch(`${process.env.API_URL}/pub`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          index,
          bot: botName,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      await message.reply(`✅ Publicando artigo ${index}`);
    } catch (err) {
      console.error(err);
      await message.reply("❌ Erro ao publicar");
    }
  },
};
```

---

## 🚀 Como rodar

```bash
node index.js
```

---

## 🔄 Como escalar

---

### ➕ Novo comando

Criar arquivo em `/commands`:

```text
commands/delete.js
```

Formato:

```js
module.exports = {
  name: "/delete",
  async execute({ message, args }) {
    ...
  },
};
```

👉 não precisa alterar dispatcher

---

### ➕ Novo bot

1. Adicionar no `.env`
2. Adicionar no `bots.config.js`

---

### ➕ Novo canal

Controlado via `channelId` por bot (opcional)

---

### ➕ Novas ações

Cada comando pode:

* chamar API
* rodar script
* disparar job
* integrar com outros serviços

---

## 💡 Casos de uso

### Publicação

```text
/pub 1
```

---

### Automação

```text
/refresh
```

---

### Administração

```text
/status
/delete 3
```

---

### Orquestração

Discord como interface para:

* controlar VPS
* disparar processos
* monitorar execução

---

## 🧠 Filosofia

* Simples > complexo
* Comando > canal
* Um backend central
* Multi-bot como camada de entrada
* Código modular por comando

---

## ⚠️ Limitações

* parsing manual (não slash command oficial)
* sem sistema de permissões
* sem fila (jobs síncronos)
* todos bots no mesmo processo

---

## 🔮 Evoluções futuras

* Slash Commands oficiais
* Permissões por usuário/cargo
* Logs estruturados (pino/winston)
* Filas (SQS, Redis, BullMQ)
* Separação por processo (1 bot = 1 worker)

---

## ✅ Resultado esperado

Sistema onde você pode:

* Criar múltiplos bots e canais
* Executar comandos via Discord
* Disparar automações no backend
* Escalar sem refatoração estrutural

---
