import { appendFileSync } from "fs";

export default async function handler(ctx = {}) {
  const name = ctx.message || "baby";
  const msg = `Hello, ${name}!`;

  appendFileSync("/tmp/hello_executions.log", `[${new Date().toISOString()}] ${msg}\n`);
  console.log(msg);
}
