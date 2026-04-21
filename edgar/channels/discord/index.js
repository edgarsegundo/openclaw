

import "dotenv/config";
import { Client, GatewayIntentBits } from "discord.js";
import { dispatch } from "./dispatcher.js";
import bots from "./bots.config.js";

const clients = [];

bots.forEach(({ token, name, channels }) => {
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
      console.log(`📩 [${name}] Received message: "${message.content}" from ${message.author.tag} in channel ${message.channel.name} (${message.channel.id})`);
      if (message.author.bot) return;
      if (channels && !channels.includes(message.channel.id)) return;

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
