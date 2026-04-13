
import fs from "fs";
import path from "path";


const commands = {};
const prefix = process.env.COMMAND_PREFIX || "/";

// auto-load de comandos
const __dirname = path.dirname(new URL(import.meta.url).pathname);
const ds = fs.readdirSync(path.join(__dirname, "commands"));
for (const file of ds) {
  const module = await import(`./commands/${file}`);
  const command = module.default || module;
  commands[command.name] = command;
}

export async function dispatch(message, context = {}) {
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
