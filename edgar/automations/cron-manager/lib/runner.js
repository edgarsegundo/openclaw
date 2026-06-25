import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import chalk from "chalk";
import dotenv from "dotenv";
import inquirer from "inquirer";
import { initDb, insertRun, recordStepEvent, closeDb } from "./db.js";
import logger from "./logger.js";
import { createTracker } from "./tracker.js";
import { writeFileAtomicSync } from "./atomic.js";
import { hasPromptTemplates, listTemplateNames, loadTemplateConfig } from "./prompt-loader.js";
import {
  selectTemplate,
  prepareTemplateInputs,
  buildRunPromptFn,
  buildDryRunPromptPreview,
} from "./prompt-runner.js";
import { loadConfig, validateConfig } from "./validator.js";

// ── Paths ────────────────────────────────────────────────────────────────────

const LIB_DIR = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(LIB_DIR, "..");
const TASKS_DIR = path.join(ROOT, "tasks");
const LOGS_DIR = path.join(ROOT, "logs");
const ARTIFACTS_DIR = path.join(ROOT, "artifacts");

// ── Artifact helpers ─────────────────────────────────────────────────────────

/**
 * Resolve inputs of type: artifact by loading JSON files from the artifacts/ directory.
 * Returns a plain object of { inputName: parsedObject | null }.
 */
function resolveArtifactInputs(inputs) {
  const result = {};
  if (!inputs) {
    return result;
  }

  for (const input of inputs) {
    if (input.type !== "artifact") {
      continue;
    }

    const fromTask = input.from_task;
    const artifactName = input.artifact;

    if (!fromTask || !artifactName) {
      logger.warn(
        `Input "${input.name}" is type artifact but missing from_task or artifact field.`,
      );
      result[input.name] = null;
      continue;
    }

    // Resolve the artifact path via the from_task's config
    const fromTaskDir = path.join(TASKS_DIR, fromTask);
    let artifactFile;
    try {
      const fromConfig = loadConfig(fromTaskDir);
      const decl = (fromConfig.artifacts || []).find((a) => a.name === artifactName);
      if (!decl) {
        logger.warn(
          `Input "${input.name}": artifact "${artifactName}" not declared in ${fromTask} config.`,
        );
        artifactFile = null;
      } else {
        artifactFile = path.join(ARTIFACTS_DIR, fromTask, decl.path);
      }
    } catch {
      logger.warn(`Input "${input.name}": could not load config for task "${fromTask}".`);
      artifactFile = null;
    }

    if (!artifactFile || !fs.existsSync(artifactFile)) {
      if (input.required) {
        throw new Error(
          `Required artifact input "${input.name}" not found at ${artifactFile ?? "(unknown path)"}`,
        );
      }
      result[input.name] = null;
      continue;
    }

    try {
      result[input.name] = JSON.parse(fs.readFileSync(artifactFile, "utf8"));
    } catch (err) {
      throw new Error(`Failed to parse artifact at ${artifactFile}: ${err.message}`, {
        cause: err,
      });
    }
  }

  return result;
}

/**
 * Save an artifact to the artifacts/ directory.
 * If the artifact name is declared in the task config, use its declared path.
 * Otherwise warn and save to artifacts/<taskName>/<name>.json.
 */
function saveArtifactFn(taskName, config) {
  return function saveArtifact(name, data) {
    const decl = (config.artifacts || []).find((a) => a.name === name);
    if (!decl) {
      logger.warn(
        `saveArtifact: "${name}" is not declared in artifacts config. Saving to ${name}.json.`,
      );
    }
    const savePath = decl
      ? path.join(ARTIFACTS_DIR, taskName, decl.path)
      : path.join(ARTIFACTS_DIR, taskName, `${name}.json`);

    fs.mkdirSync(path.dirname(savePath), { recursive: true });
    writeFileAtomicSync(savePath, JSON.stringify(data, null, 2));
    logger.success(`Artifact saved: ${path.relative(ROOT, savePath)}`);
  };
}

// ── .env loader ──────────────────────────────────────────────────────────────

function loadDotEnv(taskDir) {
  // ai-client/.env — shared AI provider keys (lowest priority)
  dotenv.config({ path: path.join(ROOT, "..", "ai-client", ".env") });
  // cron-manager root .env
  dotenv.config({ path: path.join(ROOT, ".env") });
  // task-specific .env (highest priority, never overrides shell env)
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

async function withRetry(fn, retryConfig, onRetry) {
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
        onRetry?.(attempt + 1, err);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

// ── Task-level tracking event (best-effort) ──────────────────────────────────

/**
 * Record a task-level step event (started/ok/failed/retrying) with full stack.
 * Never throws — observability must not break the run.
 */
function recordTaskEvent({ executionId, step, status, attempt, error }) {
  try {
    recordStepEvent({
      item_id: null,
      group_name: null,
      execution_id: executionId,
      step,
      status,
      attempt: attempt ?? 1,
      reason: null,
      error_message: error ? (error.message ?? String(error)) : null,
      error_stack: error?.stack ?? null,
      meta_json: null,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    logger.warn(`[tracker] failed to record task event: ${err.message}`);
  }
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
  const templateOption = options.template || null;
  const inputFile = options.inputFile || null;

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

  // Dry run — show task + optional template info, no inputs prompted, no API calls
  if (isDryRun) {
    let dryTemplate = null;
    let dryTemplateConfig = null;
    if (templateOption || hasPromptTemplates(taskDir)) {
      try {
        // For dry run, only do interactive selection if there's no --template flag
        // to avoid bothering the user when they just want a quick config check.
        // If --template was passed, validate and show it; otherwise list what's available.
        if (templateOption) {
          dryTemplate = templateOption;
          dryTemplateConfig = loadTemplateConfig(taskDir, dryTemplate);
        }
      } catch (err) {
        logger.warn(`Template info: ${err.message}`);
      }
    }
    printDryRun(taskName, config, envVars, missingEnv, dryTemplate, dryTemplateConfig, taskDir);
    return;
  }

  // Check missing env vars
  if (missingEnv.length > 0) {
    logger.warn(`Missing required env vars: ${missingEnv.join(", ")}`);
  }

  // Resolve inputs
  let inputs;
  if (inputFile) {
    if (!fs.existsSync(inputFile)) {
      logger.error(`Input file not found: ${inputFile}`);
      process.exit(1);
    }
    try {
      inputs = JSON.parse(fs.readFileSync(inputFile, "utf8"));
      logger.info(`Inputs loaded from: ${inputFile}`);
    } catch (err) {
      logger.error(`Failed to parse input file: ${err.message}`);
      process.exit(1);
    }
    // Merge defaults from config inputs into file-loaded data
    for (const input of config.inputs || []) {
      if (input.type === "artifact") continue;
      if (
        inputs[input.name] === undefined &&
        input.default !== undefined &&
        input.default !== null
      ) {
        inputs[input.name] = input.default;
      }
    }
  } else if (mode === "cron") {
    const { result, missing: missingInputs } = resolveInputsForCron(
      // Skip artifact-type inputs — they don't go through cron default resolution
      (config.inputs || []).filter((i) => i.type !== "artifact"),
    );
    if (missingInputs.length > 0) {
      for (const name of missingInputs) {
        logger.error(`Missing required input "${name}" for cron mode (no default defined).`);
      }
      process.exit(1);
    }
    inputs = result;
  } else {
    inputs = await promptInputs((config.inputs || []).filter((i) => i.type !== "artifact"));
  }

  // Resolve artifact inputs (type: artifact — loaded from artifacts/ directory)
  const artifactInputs = resolveArtifactInputs(config.inputs);
  Object.assign(inputs, artifactInputs);

  // Template selection
  const executionId = randomUUID();
  const startedAt = new Date().toISOString();

  let selectedTemplate = null;
  let runPrompt;

  if (hasPromptTemplates(taskDir) || templateOption) {
    try {
      selectedTemplate = await selectTemplate(taskDir, templateOption, mode);
    } catch (err) {
      logger.error(err.message);
      process.exit(1);
    }
  }

  if (selectedTemplate && selectedTemplate !== "none" && selectedTemplate !== "skip") {
    const templateConfig = loadTemplateConfig(taskDir, selectedTemplate);
    let preparedTemplateInputs;
    try {
      preparedTemplateInputs = await prepareTemplateInputs(templateConfig, mode);
    } catch (err) {
      logger.error(err.message);
      process.exit(1);
    }

    const contextFields = { taskName, mode, executionId };
    try {
      runPrompt = await buildRunPromptFn(
        taskDir,
        selectedTemplate,
        templateConfig,
        inputs,
        preparedTemplateInputs,
        contextFields,
      );
    } catch (err) {
      logger.error(`Failed to build runPrompt: ${err.message}`);
      process.exit(1);
    }
  } else {
    runPrompt = undefined;
  }

  // Init DB
  initDb();

  // Observability tracker (best-effort; never breaks the task)
  const tracker = createTracker({ taskName, executionId });

  // Build context
  const context = {
    taskName,
    config,
    env: envVars,
    inputs,
    mode,
    executionId,
    runPrompt: runPrompt, // undefined if no template selected
    saveArtifact: saveArtifactFn(taskName, config),
    track: tracker.track,
    hasCompleted: tracker.hasCompleted,
  };

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

    const stepName = `task:${taskName}`;
    recordTaskEvent({ executionId, step: stepName, status: "started" });

    await withRetry(
      () => withTimeout(() => taskFn(context), config.timeout_seconds),
      config.retry,
      (attempt, err) =>
        recordTaskEvent({ executionId, step: stepName, status: "retrying", attempt, error: err }),
    );

    recordTaskEvent({ executionId, step: stepName, status: "ok" });

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
    closeDb();

    writeLogFile(taskName, executionId, startedAt, logLines);

    // One-shot batch task: exit deterministically so a lingering open handle
    // (Sentry transport, sockets, etc.) can't hang the process. This keeps the
    // Discord .apr/.pub commands — which await this CLI via exec — from hanging.
    process.exit(0);
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

    recordTaskEvent({ executionId, step: `task:${taskName}`, status: "failed", error: err });

    insertRun({
      task: taskName,
      execution_id: executionId,
      started_at: startedAt,
      finished_at: finishedAt,
      duration_ms: duration,
      status: "failure",
      error_message: err.message,
    });
    closeDb();

    writeLogFile(taskName, executionId, startedAt, logLines);
    process.exit(1);
  }
}

// ── Dry-run printer ──────────────────────────────────────────────────────────

function printDryRun(
  taskName,
  config,
  envVars,
  missingEnv,
  selectedTemplate,
  templateConfig,
  taskDir,
) {
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

  // Prompt templates section
  const templateNames = listTemplateNames(taskDir);
  if (templateNames.length > 0) {
    console.log();
    if (selectedTemplate && templateConfig) {
      logger.step(`Prompt template: ${chalk.cyan(selectedTemplate)}`);
      logger.step(
        `  Provider: ${chalk.white(templateConfig.provider)} / ${chalk.white(templateConfig.model)}`,
      );
      const inputs = templateConfig.inputs || [];
      if (inputs.length > 0) {
        logger.step(`  Inputs (${inputs.length}):`);
        for (const inp of inputs) {
          const req = inp.required ? chalk.red(" (required)") : "";
          const def = inp.default != null ? chalk.gray(` [default: ${inp.default}]`) : "";
          logger.step(`    ${chalk.cyan(inp.name)} [${inp.type || "string"}]${req}${def}`);
        }
      }
      console.log();
      logger.step("  Prompt preview (unresolved vars shown as [name]):");
      const preview = buildDryRunPromptPreview(taskDir, selectedTemplate, templateConfig);
      const previewLines = preview.split("\n").slice(0, 10);
      for (const line of previewLines) {
        logger.step(`    ${chalk.gray(line)}`);
      }
      if (preview.split("\n").length > 10) {
        logger.step(chalk.gray("    ... (truncated)"));
      }
    } else {
      logger.step(
        `Prompt templates available: ${templateNames.map((n) => chalk.cyan(n)).join(", ")} (use --template <name>)`,
      );
    }
  }

  console.log();
  if (missingEnv.length > 0) {
    logger.warn("Some required env vars are missing.");
  } else {
    logger.success("Dry run complete — task looks valid.");
  }
}
