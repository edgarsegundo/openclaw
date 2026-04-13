
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
