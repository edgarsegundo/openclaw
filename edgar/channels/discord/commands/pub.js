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
