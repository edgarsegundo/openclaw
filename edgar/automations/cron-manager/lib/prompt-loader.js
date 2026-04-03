import fs from "fs";
import path from "path";
import yaml from "js-yaml";

/**
 * Returns true if a task has a prompt_templates/ folder with at least one template.
 */
export function hasPromptTemplates(taskDir) {
  const templatesDir = path.join(taskDir, "prompt_templates");
  if (!fs.existsSync(templatesDir)) {
    return false;
  }
  return listTemplateNames(taskDir).length > 0;
}

/**
 * Returns an array of template names (folder names) found in prompt_templates/.
 */
export function listTemplateNames(taskDir) {
  const templatesDir = path.join(taskDir, "prompt_templates");
  if (!fs.existsSync(templatesDir)) {
    return [];
  }
  return fs.readdirSync(templatesDir).filter((name) => {
    const dir = path.join(templatesDir, name);
    return (
      fs.statSync(dir).isDirectory() && fs.existsSync(path.join(dir, "prompt.template.config.yaml"))
    );
  });
}

/**
 * Load and parse a prompt.template.config.yaml.
 */
export function loadTemplateConfig(taskDir, templateName) {
  const configPath = path.join(
    taskDir,
    "prompt_templates",
    templateName,
    "prompt.template.config.yaml",
  );
  if (!fs.existsSync(configPath)) {
    throw new Error(`Template config not found: ${configPath}`);
  }
  return yaml.load(fs.readFileSync(configPath, "utf8"));
}

/**
 * Load the user prompt file for a template.
 */
export function loadUserPrompt(taskDir, templateName, filename = "user.md") {
  const promptPath = path.join(taskDir, "prompt_templates", templateName, filename);
  if (!fs.existsSync(promptPath)) {
    throw new Error(`User prompt file not found: ${promptPath}`);
  }
  return fs.readFileSync(promptPath, "utf8");
}

/**
 * Load the system prompt file if declared and present.
 * Returns null if not configured.
 */
export function loadSystemPrompt(taskDir, templateName, filename) {
  if (!filename) {
    return null;
  }
  const promptPath = path.join(taskDir, "prompt_templates", templateName, filename);
  if (!fs.existsSync(promptPath)) {
    return null;
  }
  return fs.readFileSync(promptPath, "utf8");
}

/**
 * Dynamically import schema.js from a template folder if it exists.
 * Returns the default export (a Zod schema) or null.
 */
export async function loadZodSchema(taskDir, templateName) {
  const schemaPath = path.join(taskDir, "prompt_templates", templateName, "schema.js");
  if (!fs.existsSync(schemaPath)) {
    return null;
  }
  const mod = await import(schemaPath + `?t=${Date.now()}`);
  return mod.default ?? null;
}

/**
 * Validate a prompt template config. Returns array of errors (empty = valid).
 */
export function validateTemplateConfig(config) {
  const errors = [];
  if (!config || typeof config !== "object") {
    errors.push("Template config is empty or invalid");
    return errors;
  }
  if (!config.provider) {
    errors.push("Missing required field: provider");
  }
  if (!["openai", "perplexity"].includes(config.provider)) {
    if (config.provider) {
      errors.push(`Unknown provider: ${config.provider}`);
    }
  }
  if (!config.model) {
    errors.push("Missing required field: model");
  }
  if (!config.user_prompt_file) {
    errors.push("Missing required field: user_prompt_file");
  }
  return errors;
}
