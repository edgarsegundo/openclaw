import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import chalk from "chalk";
import dotenv from "dotenv";
import inquirer from "inquirer";
import { initDb, insertRun } from "./db.js";
import logger from "./logger.js";
import { loadConfig, validateConfig } from "./validator.js";

// ── Paths ────────────────────────────────────────────────────────────────────

const LIB_DIR = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(LIB_DIR, "..");
const TASKS_DIR = path.join(ROOT, "tasks");
const LOGS_DIR = path.join(ROOT, "logs");

// ── .env loader ──────────────────────────────────────────────────────────────

function loadDotEnv(taskDir) {
  // Root .env first (lower priority)
  dotenv.config({ path: path.join(ROOT, ".env") });
  // Task .env second (overrides root, but never overrides shell env)
  dotenv.config({ path: path.join(taskDir, ".env") });
}

// ── Task helpers ─────────────────────────────────────────────────────────────

export function getTaskDir(taskName) {
  return path.join(TASKS_DIR, taskName);
}

export function taskExists(taskName) {
  return fs.existsSync(path.join(getTaskDir(taskName), "task.config.yaml"));
}

export function listTaskNames() {
  if (!fs.existsSync(TASKS_DIR)) {
    return [];
  }
  return fs.readdirSync(TASKS_DIR).filter((name) => {
    const dir = path.join(TASKS_DIR, name);
    return fs.statSync(dir).isDirectory() && fs.existsSync(path.join(dir, "task.config.yaml"));
  });
}

// ── Env var resolution ───────────────────────────────────────────────────────

export function resolveEnvVars(envVarsConfig, mode) {
  const resolved = {};
  const missing = [];

  if (!envVarsConfig) {
    return { resolved, missing };
  }

  const commonVars = envVarsConfig.common || [];
  const modeVars = envVarsConfig[mode] || [];
  const allVars = [...commonVars, ...modeVars];

  for (const v of allVars) {
    // Support both string format ("MY_VAR") and object format ({ name, required, default, help_tip })
    const name = typeof v === "string" ? v : v.name;
    const required = typeof v === "string" ? true : v.required !== false;
    const defaultVal = typeof v === "string" ? undefined : v.default;

    if (process.env[name] !== undefined) {
      resolved[name] = process.env[name];
    } else if (defaultVal !== undefined && defaultVal !== null) {
      resolved[name] = String(defaultVal);
    } else if (required) {
      missing.push(name);
    }
  }

  return { resolved, missing };
}

// ── Input prompting (manual mode) ────────────────────────────────────────────

async function promptInputs(inputs) {
  const result = {};
  if (!inputs || inputs.length === 0) {
    return result;
  }

  const questions = inputs.map((input) => buildQuestion(input));
  const answers = await inquirer.prompt(questions);

  // Coerce types
  for (const input of inputs) {
    const val = answers[input.name];
    if (input.type === "number" && val !== undefined && val !== null && val !== "") {
      result[input.name] = Number(val);
    } else {
      result[input.name] = val;
    }
  }

  return result;
}

function buildQuestion(input) {
  const { name, type, required, default: defaultVal, help_tip } = input;
  const label = help_tip || name;

  if (type === "boolean") {
    return {
      type: "confirm",
      name,
      message: label,
      default: defaultVal != null ? Boolean(defaultVal) : false,
    };
  }

  if (type === "number") {
    return {
      type: "input",
      name,
      message: label,
      default: defaultVal != null ? String(defaultVal) : undefined,
      validate(val) {
        if (!val && !required) {
          return true;
        }
        if (!val && required) {
          return "This field is required";
        }
        if (isNaN(Number(val))) {
          return "Must be a number";
        }
        return true;
      },
    };
  }

  if (type === "date") {
    return {
      type: "input",
      name,
      message: label,
      default: defaultVal || undefined,
      validate(val) {
        if (!val && !required) {
          return true;
        }
        if (!val && required) {
          return "This field is required";
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) {
          return "Format must be YYYY-MM-DD";
        }
        return true;
      },
    };
  }

  // string (default)
  return {
    type: "input",
    name,
    message: label,
    default: defaultVal || undefined,
    validate(val) {
      if (!val && required) {
        return "This field is required";
      }
      return true;
    },
  };
}

// ── Input resolution (cron mode — no prompts) ────────────────────────────────

function resolveInputsForCron(inputs) {
  const result = {};
  const missing = [];

  if (!inputs) {
    return { result, missing };
  }

  for (const input of inputs) {
    if (input.default !== undefined && input.default !== null && input.default !== "") {
      result[input.name] = input.default;
    } else if (input.required) {
      missing.push(input.name);
    }
  }

  return { result, missing };
}

// ── Timeout ──────────────────────────────────────────────────────────────────

async function withTimeout(fn, seconds) {
  if (!seconds) {
    return fn();
  }

  return Promise.race([
    fn(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${seconds}s`)), seconds * 1000),
    ),
  ]);
}

// ── Retry ────────────────────────────────────────────────────────────────────

async function withRetry(fn, retryConfig) {
  const maxRetries = retryConfig?.max_retries || 0;
  if (maxRetries === 0) {
    return fn();
  }

  const delaySeconds = retryConfig?.delay_seconds || 5;
  const backoff = retryConfig?.backoff || "linear";

  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay =
          backoff === "exponential"
            ? delaySeconds * Math.pow(2, attempt) * 1000
            : delaySeconds * 1000;
        logger.warn(
          `Attempt ${attempt + 1} failed: ${err.message}. Retrying in ${delay / 1000}s...`,
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

// ── Log file ─────────────────────────────────────────────────────────────────

function writeLogFile(taskName, executionId, startedAt, lines) {
  const taskLogDir = path.join(LOGS_DIR, taskName);
  fs.mkdirSync(taskLogDir, { recursive: true });

  const ts = startedAt.replace(/[:.]/g, "-").slice(0, 19);
  const shortId = executionId.slice(0, 8);
  const filename = `${ts}_${shortId}.log`;
  const logPath = path.join(taskLogDir, filename);

  fs.writeFileSync(logPath, lines.join("\n") + "\n", "utf8");
  return logPath;
}

// ── Run task ─────────────────────────────────────────────────────────────────

export async function runTask(taskName, options = {}) {
  const mode = options.mode || "manual";
  const isDryRun = options.dryRun || false;

  // Load and validate config
  const taskDir = getTaskDir(taskName);
  if (!taskExists(taskName)) {
    logger.error(`Task "${taskName}" not found.`);
    process.exit(1);
  }

  const config = loadConfig(taskDir);
  const configErrors = validateConfig(config);
  if (configErrors.length > 0) {
    logger.error("Invalid task configuration:");
    for (const e of configErrors) {
      logger.step(e);
    }
    process.exit(1);
  }

  // Check mode permission
  if (mode === "manual" && config.allow_manual === false) {
    logger.error(`Task "${taskName}" does not allow manual execution.`);
    process.exit(1);
  }
  if (mode === "cron" && config.allow_cron === false) {
    logger.error(`Task "${taskName}" does not allow cron execution.`);
    process.exit(1);
  }

  // Load .env files (root + task-specific)
  loadDotEnv(taskDir);

  // Resolve env vars
  const { resolved: envVars, missing: missingEnv } = resolveEnvVars(config.env_vars, mode);

  // Dry run
  if (isDryRun) {
    printDryRun(taskName, config, envVars, missingEnv);
    return;
  }

  // Check missing env vars
  if (missingEnv.length > 0) {
    logger.warn(`Missing required env vars: ${missingEnv.join(", ")}`);
  }

  // Resolve inputs
  let inputs;
  if (mode === "cron") {
    const { result, missing: missingInputs } = resolveInputsForCron(config.inputs);
    if (missingInputs.length > 0) {
      for (const name of missingInputs) {
        logger.error(`Missing required input "${name}" for cron mode (no default defined).`);
      }
      process.exit(1);
    }
    inputs = result;
  } else {
    inputs = await promptInputs(config.inputs);
  }

  // Build context
  const executionId = randomUUID();
  const startedAt = new Date().toISOString();

  const context = {
    taskName,
    config,
    env: envVars,
    inputs,
    mode,
    executionId,
  };

  // Init DB
  initDb();

  // Log capture
  const logLines = [];
  logLines.push(`execution_id: ${executionId}`);
  logLines.push(`started_at: ${startedAt}`);
  logLines.push(`mode: ${mode}`);
  logLines.push(`task: ${taskName}`);
  logLines.push("---");

  const originalLog = console.log;
  const originalError = console.error;

  console.log = (...args) => {
    const line = args.map(String).join(" ");
    logLines.push(line);
    originalLog.apply(console, args);
  };
  console.error = (...args) => {
    const line = `[stderr] ${args.map(String).join(" ")}`;
    logLines.push(line);
    originalError.apply(console, args);
  };

  const startTime = Date.now();

  try {
    logger.step(`Executing task: ${taskName}`);

    // Dynamic import of the task module
    const taskModulePath = pathToFileURL(path.join(taskDir, "index.js")).href;
    const taskModule = await import(taskModulePath);
    const taskFn = taskModule.default;

    if (typeof taskFn !== "function") {
      throw new Error(`Task "${taskName}" does not export a default function.`);
    }

    await withRetry(() => withTimeout(() => taskFn(context), config.timeout_seconds), config.retry);

    const duration = Date.now() - startTime;
    const finishedAt = new Date().toISOString();

    logLines.push("---");
    logLines.push(`status: success`);
    logLines.push(`duration_ms: ${duration}`);
    logLines.push(`finished_at: ${finishedAt}`);

    // Restore console
    console.log = originalLog;
    console.error = originalError;

    logger.success(`Task "${taskName}" completed in ${duration}ms`);

    insertRun({
      task: taskName,
      execution_id: executionId,
      started_at: startedAt,
      finished_at: finishedAt,
      duration_ms: duration,
      status: "success",
      error_message: null,
    });

    writeLogFile(taskName, executionId, startedAt, logLines);
  } catch (err) {
    const duration = Date.now() - startTime;
    const finishedAt = new Date().toISOString();

    logLines.push("---");
    logLines.push(`status: failure`);
    logLines.push(`error: ${err.message}`);
    logLines.push(`duration_ms: ${duration}`);
    logLines.push(`finished_at: ${finishedAt}`);

    // Restore console
    console.log = originalLog;
    console.error = originalError;

    logger.error(`Task "${taskName}" failed: ${err.message}`);

    insertRun({
      task: taskName,
      execution_id: executionId,
      started_at: startedAt,
      finished_at: finishedAt,
      duration_ms: duration,
      status: "failure",
      error_message: err.message,
    });

    writeLogFile(taskName, executionId, startedAt, logLines);
    process.exit(1);
  }
}

// ── Dry-run printer ──────────────────────────────────────────────────────────

function printDryRun(taskName, config, envVars, missingEnv) {
  logger.header(`[DRY RUN] Task: ${taskName}`);

  logger.step(`Entrypoint:   ${chalk.white(config.entrypoint)}`);
  logger.step(`Working dir:  ${chalk.white(config.working_dir || "./")}`);
  logger.step(
    `Timeout:      ${chalk.white(config.timeout_seconds ? `${config.timeout_seconds}s` : "none")}`,
  );

  const retry = config.retry || {};
  logger.step(
    `Retry:        ${chalk.white(
      retry.max_retries
        ? `${retry.max_retries} retries, ${retry.delay_seconds}s delay (${retry.backoff || "linear"})`
        : "none",
    )}`,
  );

  console.log();
  if (Object.keys(envVars).length > 0 || missingEnv.length > 0) {
    logger.step("Env vars:");
    for (const [key, val] of Object.entries(envVars)) {
      logger.step(`  ${chalk.cyan(key)} = ${chalk.gray(val)}`);
    }
    for (const name of missingEnv) {
      logger.step(`  ${chalk.red(name)} = MISSING`);
    }
  } else {
    logger.step("Env vars: none");
  }

  if (config.inputs?.length > 0) {
    console.log();
    logger.step("Inputs:");
    for (const input of config.inputs) {
      const req = input.required ? chalk.red(" (required)") : "";
      const def = input.default != null ? chalk.gray(` [default: ${input.default}]`) : "";
      logger.step(`  ${chalk.cyan(input.name)} [${input.type || "string"}]${req}${def}`);
    }
  }

  console.log();
  if (missingEnv.length > 0) {
    logger.warn("Some required env vars are missing.");
  } else {
    logger.success("Dry run complete — task looks valid.");
  }
}
