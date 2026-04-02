/**
 * Task: {{NAME}}
 *
 * Implement your task logic below.
 * Throw an error to signal failure.
 */

export default async function (context) {
  const { taskName, inputs, env, mode, executionId } = context;

  console.log(`Running task: ${taskName}`);
  console.log(`Mode: ${mode}`);
  console.log(`Execution ID: ${executionId}`);
  console.log("Inputs:", inputs);
  console.log("Environment Variables:", env);

  // TODO: implement your logic here
}
