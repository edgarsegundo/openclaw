const fs = require("fs");
const path = require("path");

const commands = {};
const prefix = process.env.COMMAND_PREFIX || "/";

// auto-load de comandos
const ds = fs.readdirSync(path.join(__dirname, "commands"));
ds.forEach((file) => {
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
