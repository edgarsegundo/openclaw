import fs from "fs";
import path from "path";
import yaml from "js-yaml";

/**
 * Load and parse task.config.yaml from a task directory.
 */
export function loadConfig(taskDir) {
  const configPath = path.join(taskDir, "task.config.yaml");
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config not found: ${configPath}`);
  }
  const raw = fs.readFileSync(configPath, "utf8");
  return yaml.load(raw);
}

/**
 * Validate the structure of a parsed task config.
 * Returns an array of error strings (empty = valid).
 */
export function validateConfig(config) {
  const errors = [];

  if (!config || typeof config !== "object") {
    errors.push("Config is empty or not an object");
    return errors;
  }
  if (!config.name) {
    errors.push("Missing required field: name");
  }
  if (!config.entrypoint) {
    errors.push("Missing required field: entrypoint");
  }
  if (config.timeout_seconds != null && typeof config.timeout_seconds !== "number") {
    errors.push("timeout_seconds must be a number");
  }
  if (config.retry) {
    if (config.retry.max_retries != null && typeof config.retry.max_retries !== "number") {
      errors.push("retry.max_retries must be a number");
    }
    if (config.retry.delay_seconds != null && typeof config.retry.delay_seconds !== "number") {
      errors.push("retry.delay_seconds must be a number");
    }
    if (config.retry.backoff && !["linear", "exponential"].includes(config.retry.backoff)) {
      errors.push('retry.backoff must be "linear" or "exponential"');
    }
  }
  if (config.inputs && !Array.isArray(config.inputs)) {
    errors.push("inputs must be an array");
  }

  return errors;
}

/**
 * Validate a single input value against its definition.
 * Returns null if valid, or an error string.
 */
export function validateInputValue(value, input) {
  const { name, type, required } = input;

  if ((value === undefined || value === null || value === "") && required) {
    return `Input "${name}" is required`;
  }
  if (value === undefined || value === null || value === "") {
    return null;
  }

  switch (type) {
    case "number":
      if (isNaN(Number(value))) {
        return `Input "${name}" must be a number`;
      }
      break;
    case "boolean":
      if (
        typeof value !== "boolean" &&
        !["true", "false", "y", "n"].includes(String(value).toLowerCase())
      ) {
        return `Input "${name}" must be a boolean`;
      }
      break;
    case "date":
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
        return `Input "${name}" must be in YYYY-MM-DD format`;
      }
      break;
    case "string":
    default:
      break;
  }
  return null;
}

/**
 * Validate a cron expression (basic 5-field check).
 * Returns true if valid.
 */
export function validateCronExpression(expr) {
  if (!expr || typeof expr !== "string") {
    return false;
  }
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5 || parts.length > 6) {
    return false;
  }

  const ranges = [
    { min: 0, max: 59 }, // minute
    { min: 0, max: 23 }, // hour
    { min: 1, max: 31 }, // day of month
    { min: 1, max: 12 }, // month
    { min: 0, max: 7 }, // day of week
  ];

  for (let i = 0; i < 5; i++) {
    if (!isValidCronField(parts[i], ranges[i])) {
      return false;
    }
  }

  return true;
}

function isValidCronField(field, { min, max }) {
  if (field === "*") {
    return true;
  }

  // Handle */N
  if (field.startsWith("*/")) {
    const n = Number(field.slice(2));
    return !isNaN(n) && n >= 1;
  }

  // Handle comma-separated values
  const segments = field.split(",");
  for (const seg of segments) {
    // Handle range N-M
    if (seg.includes("-")) {
      const [a, b] = seg.split("-").map(Number);
      if (isNaN(a) || isNaN(b) || a < min || b > max || a > b) {
        return false;
      }
      continue;
    }
    const n = Number(seg);
    if (isNaN(n) || n < min || n > max) {
      return false;
    }
  }
  return true;
}
