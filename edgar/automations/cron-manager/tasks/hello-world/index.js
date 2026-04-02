/**
 * Task: hello-world
 *
 * Implement your task logic below.
 * Throw an error to signal failure.
 */

export default async function (context) {
  const { taskName, inputs, env, mode, executionId } = context;

  const prefix = env.GREETING_PREFIX || "Hello";
  const username = inputs.username || "World";
  const repeat = inputs.repeat || 1;
  const shout = inputs.shout || false;

  console.log(`Task: ${taskName} | Mode: ${mode}`);
  console.log(`Execution: ${executionId}`);
  console.log(`Date: ${inputs.date || "unknown"}`);
  console.log("---");

  for (let i = 0; i < repeat; i++) {
    let msg = `${prefix}, ${username}!`;
    if (shout) {
      msg = msg.toUpperCase();
    }
    console.log(msg);
  }

  if (env.DEBUG_MODE === "true") {
    console.log("--- DEBUG ---");
    console.log("env:", JSON.stringify(env));
    console.log("inputs:", JSON.stringify(inputs));
  }

  console.log("---");
  console.log("Done!");
}
