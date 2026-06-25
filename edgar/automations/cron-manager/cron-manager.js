#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { Command } from "commander";
import inquirer from "inquirer";
import chalk from "chalk";

import logger from "./lib/logger.js";
import { loadConfig, validateConfig, validateCronExpression } from "./lib/validator.js";
import {
  initDb,
  getLastRun,
  getHistory,
  getFailedHistory,
  getAllGroups,
  getStepFunnel,
  getStuckItems,
  getRecentErrors,
} from "./lib/db.js";
import { runTask, listTaskNames, getTaskDir, taskExists } from "./lib/runner.js";
import {
  listTemplateNames,
  loadTemplateConfig,
  validateTemplateConfig,
} from "./lib/prompt-loader.js";

// ── Paths ────────────────────────────────────────────────────────────────────
const ROOT = path.dirname(new URL(import.meta.url).pathname);
const TASKS_DIR = path.join(ROOT, "tasks");
const TEMPLATES_DIR = path.join(ROOT, "templates");
const ARTIFACTS_DIR = path.join(ROOT, "artifacts");

// ── CLI setup ────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("cron-manager")
  .description("CLI for creating and running automated tasks")
  .version("1.0.0");

// ── create-task ──────────────────────────────────────────────────────────────

program
  .command("create-task <name>")
  .description("Create a new task from template")
  .action(async (name) => {
    const taskDir = path.join(TASKS_DIR, name);

    if (fs.existsSync(taskDir)) {
      logger.error(`Task "${name}" already exists at tasks/${name}/`);
      process.exit(1);
    }

    // Interactive prompts
    const answers = await inquirer.prompt([
      {
        type: "input",
        name: "description",
        message: "Description (optional):",
        default: "",
      },
      {
        type: "confirm",
        name: "allowManual",
        message: "Allow manual run?",
        default: true,
      },
      {
        type: "confirm",
        name: "allowCron",
        message: "Allow cron run?",
        default: true,
      },
      {
        type: "input",
        name: "cronExpression",
        message: "Cron expression (optional):",
        default: "",
        validate(val) {
          if (!val) return true;
          if (validateCronExpression(val)) return true;
          return "Invalid cron expression. Please try again.";
        },
      },
      {
        type: "confirm",
        name: "includePromptTemplate",
        message: "Include prompt template scaffold? (AI structured output with runPrompt)",
        default: false,
      },
      {
        type: "input",
        name: "templateName",
        message: "Prompt template name:",
        default: "my-template",
        when: (ans) => ans.includePromptTemplate,
        validate(val) {
          if (!val || !val.trim()) return "Template name cannot be empty.";
          if (!/^[a-z0-9-]+$/.test(val.trim()))
            return "Use only lowercase letters, numbers, and hyphens.";
          return true;
        },
      },
    ]);

    // Read templates
    const yamlTemplate = fs.readFileSync(path.join(TEMPLATES_DIR, "task.config.yaml"), "utf8");
    const jsTemplate = fs.readFileSync(path.join(TEMPLATES_DIR, "index.js"), "utf8");

    const today = new Date().toISOString().slice(0, 10);
    const templateName = answers.templateName?.trim() ?? "my-template";

    // Replace placeholders
    const yamlContent = yamlTemplate
      .replace(/\{\{NAME\}\}/g, name)
      .replace(/\{\{DESCRIPTION\}\}/g, answers.description)
      .replace(/\{\{DATE\}\}/g, today)
      .replace(/\{\{ALLOW_MANUAL\}\}/g, String(answers.allowManual))
      .replace(/\{\{ALLOW_CRON\}\}/g, String(answers.allowCron))
      .replace(/\{\{CRON_SUGGESTION\}\}/g, answers.cronExpression);

    const jsContent = jsTemplate
      .replace(/\{\{NAME\}\}/g, name)
      .replace(/\{\{TEMPLATE_NAME\}\}/g, templateName);

    // Write task files
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "task.config.yaml"), yamlContent, "utf8");
    fs.writeFileSync(path.join(taskDir, "index.js"), jsContent, "utf8");

    // Optionally scaffold prompt template
    if (answers.includePromptTemplate) {
      const srcTemplateDir = path.join(TEMPLATES_DIR, "prompt_templates", "my-template");
      const destTemplateDir = path.join(taskDir, "prompt_templates", templateName);
      fs.mkdirSync(destTemplateDir, { recursive: true });

      for (const file of fs.readdirSync(srcTemplateDir)) {
        const raw = fs.readFileSync(path.join(srcTemplateDir, file), "utf8");
        const content = raw
          .replace(/\{\{NAME\}\}/g, name)
          .replace(/\{\{TEMPLATE_NAME\}\}/g, templateName);
        fs.writeFileSync(path.join(destTemplateDir, file), content, "utf8");
      }
    }

    logger.success(`Task created: ${name}`);
    console.log();
    logger.step(`tasks/${name}/task.config.yaml`);
    logger.step(`tasks/${name}/index.js`);
    if (answers.includePromptTemplate) {
      logger.step(`tasks/${name}/prompt_templates/${templateName}/prompt.template.config.yaml`);
      logger.step(`tasks/${name}/prompt_templates/${templateName}/system.md`);
      logger.step(`tasks/${name}/prompt_templates/${templateName}/user.md`);
      logger.step(`tasks/${name}/prompt_templates/${templateName}/schema.js`);
    }

    if (answers.cronExpression) {
      const absPath = path.resolve(ROOT);
      console.log();
      logger.info("Suggested crontab entry:");
      console.log();
      console.log(
        `  ${answers.cronExpression} cd ${absPath} && node cron-manager.js run ${name} --mode cron`,
      );
      console.log();
    }
  });

// ── run ──────────────────────────────────────────────────────────────────────

program
  .command("run <task>")
  .description("Run a task")
  .option("-m, --mode <mode>", "Execution mode: manual | cron", "manual")
  .option("-t, --template <template>", "Prompt template to use")
  .option(
    "-i, --input-file <path>",
    "Path to a JSON file with all inputs (skips interactive prompts)",
  )
  .option("--article-index <n>", "Índice do artigo em articleInputs[] (para cluster.result.json)")
  .option("--dry-run", "Show what would run without executing", false)
  .action(async (task, opts) => {
    if (!["manual", "cron"].includes(opts.mode)) {
      logger.error(`Invalid mode "${opts.mode}". Use "manual" or "cron".`);
      process.exit(1);
    }

    // Suporte especial para cluster.result.json + índice
    let inputFile = opts.inputFile;
    if (inputFile && opts.articleIndex !== undefined) {
      // Cria um arquivo temporário com o payload especial
      const absPath = path.resolve(inputFile);
      const payload = {
        _clusterJsonFile: absPath,
        _articleIndex: Number(opts.articleIndex),
      };
      const tmpPath = absPath + `.article-${opts.articleIndex}.tmp.json`;
      fs.writeFileSync(tmpPath, JSON.stringify(payload), "utf8");
      inputFile = tmpPath;
    }

    await runTask(task, {
      mode: opts.mode,
      dryRun: opts.dryRun,
      template: opts.template,
      inputFile,
    });
  });

// ── list-artifacts ───────────────────────────────────────────────────────────

program
  .command("list-artifacts")
  .description("List all artifacts declared by all tasks")
  .action(() => {
    const taskNames = listTaskNames();

    if (taskNames.length === 0) {
      logger.info("No tasks found.");
      return;
    }

    const headers = ["TASK", "ARTIFACT", "FILE", "LAST MODIFIED"];
    const rows = [];

    for (const name of taskNames) {
      const taskDir = getTaskDir(name);
      let config;
      try {
        config = loadConfig(taskDir);
      } catch {
        continue;
      }

      const artifacts = config.artifacts || [];
      if (artifacts.length === 0) continue;

      for (const art of artifacts) {
        const filePath = path.join(ARTIFACTS_DIR, name, art.path);
        let lastModified = "—";
        if (fs.existsSync(filePath)) {
          const mtime = fs.statSync(filePath).mtime;
          lastModified = mtime.toISOString().replace("T", " ").slice(0, 19);
        }
        rows.push([name, art.name, path.relative(ROOT, filePath), lastModified]);
      }
    }

    if (rows.length === 0) {
      logger.info("No artifacts declared in any task.");
      return;
    }

    logger.table(headers, rows);
  });

// ── list ─────────────────────────────────────────────────────────────────────

program
  .command("list")
  .description("List all tasks and their last run status")
  .action(() => {
    const taskNames = listTaskNames();

    if (taskNames.length === 0) {
      logger.info("No tasks found. Create one with: create-task <name>");
      return;
    }

    initDb();

    const headers = ["TASK", "LAST RUN", "STATUS"];
    const rows = [];

    for (const name of taskNames) {
      const last = getLastRun(name);
      if (last) {
        const ts = last.started_at.replace("T", " ").slice(0, 19);
        const statusColor =
          last.status === "success" ? chalk.green(last.status) : chalk.red(last.status);
        rows.push([name, ts, statusColor]);
      } else {
        rows.push([name, "—", "—"]);
      }
    }

    logger.table(headers, rows);
  });

// ── history ──────────────────────────────────────────────────────────────────

program
  .command("history <task>")
  .description("Show execution history for a task")
  .option("-n, --limit <n>", "Number of entries to show", "20")
  .option("--failed", "Show only failed runs", false)
  .action((task, opts) => {
    if (!taskExists(task)) {
      logger.error(`Task "${task}" not found.`);
      process.exit(1);
    }

    initDb();

    const limit = parseInt(opts.limit, 10) || 20;
    const runs = opts.failed ? getFailedHistory(task, limit) : getHistory(task, limit);

    if (runs.length === 0) {
      logger.info(
        opts.failed ? `No failed runs found for "${task}".` : `No execution history for "${task}".`,
      );
      return;
    }

    const headers = ["ID", "STARTED AT", "DURATION", "STATUS", "ERROR"];
    const rows = runs.map((r) => [
      r.execution_id.slice(0, 8),
      r.started_at.replace("T", " ").slice(0, 19),
      r.duration_ms != null ? `${r.duration_ms}ms` : "—",
      r.status === "success" ? chalk.green(r.status) : chalk.red(r.status),
      r.error_message ? r.error_message.slice(0, 40) : "—",
    ]);

    logger.table(headers, rows);
  });

// ── pipeline ───────────────────────────────────────────────────────────────────

const STEPS = ["fetch", "pick", "write", "publish", "index"];

program
  .command("pipeline")
  .description("Show per-item pipeline tracking: funnel, stuck items, recent errors")
  .option("-g, --group <group>", "Filter by pipeline group")
  .action((opts) => {
    initDb();
    const group = opts.group || null;

    const groups = getAllGroups();
    logger.header("Pipeline status" + (group ? ` — ${group}` : ""));
    if (groups.length) {
      logger.step(`Groups: ${groups.join(", ")}`);
    }

    // Funnel: items per step, broken down by status.
    const funnel = getStepFunnel(group);
    const byStep = Object.fromEntries(STEPS.map((s) => [s, { ok: 0, skipped: 0, failed: 0 }]));
    for (const r of funnel) {
      if (byStep[r.step] && byStep[r.step][r.status] !== undefined) {
        byStep[r.step][r.status] = r.items;
      }
    }
    logger.header("\nFunnel (distinct items per step)");
    logger.table(
      ["STEP", "OK", "SKIPPED", "FAILED"],
      STEPS.map((s) => [
        s,
        chalk.green(byStep[s].ok),
        byStep[s].skipped ? chalk.yellow(byStep[s].skipped) : "0",
        byStep[s].failed ? chalk.red(byStep[s].failed) : "0",
      ]),
    );

    // Stuck items (current_status = failed).
    const stuck = getStuckItems(50).filter((s) => !group || s.group_name === group);
    logger.header("\nStuck items (failed)");
    if (!stuck.length) {
      logger.success("None 🎉");
    } else {
      logger.table(
        ["ITEM", "GROUP", "STEP", "LAST ERROR"],
        stuck.map((s) => [
          (s.title || s.item_id || "").slice(0, 30),
          s.group_name || "—",
          s.current_step,
          chalk.red((s.last_error || "").slice(0, 40)),
        ]),
      );
    }

    // Recent errors.
    const errors = getRecentErrors(15).filter((e) => !group || e.group_name === group);
    logger.header("\nRecent errors");
    if (!errors.length) {
      logger.success("None 🎉");
    } else {
      logger.table(
        ["WHEN", "STEP", "GROUP", "MESSAGE"],
        errors.map((e) => [
          (e.created_at || "").replace("T", " ").slice(0, 19),
          e.step,
          e.group_name || "—",
          chalk.red((e.error_message || e.reason || "").slice(0, 40)),
        ]),
      );
    }

    logger.step("\nFull timeline + auto-refresh: node apps/pipeline-dashboard/server.js");
  });

// ── inspect ──────────────────────────────────────────────────────────────────

program
  .command("inspect <task>")
  .description("Show full resolved config for a task")
  .action((task) => {
    if (!taskExists(task)) {
      logger.error(`Task "${task}" not found.`);
      process.exit(1);
    }

    const taskDir = getTaskDir(task);
    const config = loadConfig(taskDir);

    logger.header(`Task: ${task}`);

    // Config
    logger.step(`description:    ${chalk.white(config.description || "—")}`);
    logger.step(`author:         ${chalk.white(config.author || "—")}`);
    logger.step(`created_at:     ${chalk.white(config.created_at || "—")}`);
    logger.step(`tags:           ${chalk.white(JSON.stringify(config.tags || []))}`);
    logger.step(`allow_manual:   ${chalk.white(config.allow_manual ?? true)}`);
    logger.step(`allow_cron:     ${chalk.white(config.allow_cron ?? true)}`);
    logger.step(`cron_suggestion: ${chalk.white(config.cron_suggestion || "—")}`);
    logger.step(`entrypoint:     ${chalk.white(config.entrypoint)}`);
    logger.step(`working_dir:    ${chalk.white(config.working_dir || "./")}`);
    logger.step(
      `timeout:        ${chalk.white(
        config.timeout_seconds ? `${config.timeout_seconds}s` : "none",
      )}`,
    );

    const retry = config.retry || {};
    logger.step(
      `retry:          ${chalk.white(
        retry.max_retries
          ? `${retry.max_retries} retries, ${retry.delay_seconds}s delay (${retry.backoff || "linear"})`
          : "none",
      )}`,
    );

    // Env vars
    const envSections = config.env_vars || {};
    for (const section of ["common", "manual", "cron"]) {
      const vars = envSections[section] || [];
      console.log();
      logger.step(`env_vars.${section}:`);
      if (vars.length === 0) {
        logger.step("  (none)");
      } else {
        for (const v of vars) {
          if (typeof v === "string") {
            logger.step(`  ${chalk.cyan(v)}`);
          } else {
            const req = v.required ? chalk.red(" (required)") : " (optional)";
            const def = v.default != null ? chalk.gray(` [default: ${v.default}]`) : "";
            logger.step(`  ${chalk.cyan(v.name)}${req}${def}`);
          }
        }
      }
    }

    // Inputs
    if (config.inputs?.length > 0) {
      console.log();
      logger.step("Inputs:");
      for (const input of config.inputs) {
        const req = input.required ? chalk.red(" (required)") : "";
        const def = input.default != null ? chalk.gray(` [default: ${input.default}]`) : "";
        logger.step(`  ${chalk.cyan(input.name)} [${input.type || "string"}]${req}${def}`);
      }
    }

    // Prompt templates
    const templateNames = listTemplateNames(taskDir);
    if (templateNames.length > 0) {
      console.log();
      logger.step("Prompt templates:");
      for (const tName of templateNames) {
        try {
          const tConfig = loadTemplateConfig(taskDir, tName);
          const inputCount = (tConfig.inputs || []).length;
          logger.step(
            `  → ${chalk.cyan(tName)}  [${tConfig.provider} / ${tConfig.model}]  ${inputCount} input${inputCount !== 1 ? "s" : ""}`,
          );
        } catch {
          logger.step(`  → ${chalk.cyan(tName)}  (invalid config)`);
        }
      }
    }

    // Artifacts
    const artifacts = config.artifacts || [];
    if (artifacts.length > 0) {
      console.log();
      logger.step("Artifacts:");
      for (const art of artifacts) {
        const filePath = path.join(ARTIFACTS_DIR, task, art.path);
        const exists = fs.existsSync(filePath);
        const status = exists ? chalk.green("exists") : chalk.gray("never saved");
        logger.step(
          `  → ${chalk.cyan(art.name)}  [${art.template || "?"}]  ${path.relative(ROOT, filePath)}  ${status}`,
        );
      }
    }

    // Last run
    initDb();
    const last = getLastRun(task);
    console.log();
    if (last) {
      const ts = last.started_at.replace("T", " ").slice(0, 19);
      const statusColor =
        last.status === "success" ? chalk.green(last.status) : chalk.red(last.status);
      logger.step(`Last run: ${ts} — ${statusColor} (${last.duration_ms ?? "?"}ms)`);
    } else {
      logger.step("Last run: none");
    }
  });

// ── doctor ───────────────────────────────────────────────────────────────────

program
  .command("doctor")
  .description("Validate all tasks and check system health")
  .action(() => {
    logger.header("Doctor — checking tasks and system health");

    const taskNames = listTaskNames();
    let healthy = 0;
    let issues = 0;

    if (taskNames.length === 0) {
      logger.info("No tasks found.");
    } else {
      logger.step("Tasks:");
      for (const name of taskNames) {
        const taskDir = getTaskDir(name);
        const errs = [];

        // Check index.js exists
        if (!fs.existsSync(path.join(taskDir, "index.js"))) {
          errs.push("Missing index.js");
        }

        // Validate YAML
        try {
          const config = loadConfig(taskDir);
          const configErrors = validateConfig(config);
          for (const e of configErrors) errs.push(e);
        } catch (e) {
          errs.push(`YAML error: ${e.message}`);
        }

        if (errs.length === 0) {
          logger.success(`  ${name} — valid`);
          healthy++;
        } else {
          logger.error(`  ${name}`);
          for (const e of errs) logger.step(`    ${chalk.red(e)}`);
          issues++;
        }
      }
    }

    // Check DB
    console.log();
    logger.step("Database:");
    try {
      initDb();
      logger.success("  cron-manager.db — accessible");
    } catch (e) {
      logger.error(`  cron-manager.db — ${e.message}`);
      issues++;
    }

    // Check prompt templates for all tasks
    const taskNamesForTemplates = listTaskNames();
    let templateIssues = 0;
    for (const name of taskNamesForTemplates) {
      const tDir = getTaskDir(name);
      const tNames = listTemplateNames(tDir);
      for (const tName of tNames) {
        const tErrs = [];
        try {
          const tConfig = loadTemplateConfig(tDir, tName);
          const tConfigErrors = validateTemplateConfig(tConfig);
          for (const e of tConfigErrors) tErrs.push(e);
          const userFile = path.join(tDir, "prompt_templates", tName, tConfig.user_prompt_file);
          if (!fs.existsSync(userFile)) {
            tErrs.push(`user_prompt_file not found: ${tConfig.user_prompt_file}`);
          }
          if (tConfig.system_prompt_file) {
            const sysFile = path.join(tDir, "prompt_templates", tName, tConfig.system_prompt_file);
            if (!fs.existsSync(sysFile)) {
              tErrs.push(`system_prompt_file not found: ${tConfig.system_prompt_file}`);
            }
          }
        } catch (e) {
          tErrs.push(`Config error: ${e.message}`);
        }
        if (tErrs.length > 0) {
          if (templateIssues === 0) {
            console.log();
            logger.step("Prompt templates:");
          }
          logger.error(`  ${name}/${tName}`);
          for (const e of tErrs) logger.step(`    ${chalk.red(e)}`);
          templateIssues++;
          issues++;
        }
      }
    }
    if (
      templateIssues === 0 &&
      taskNamesForTemplates.some((n) => listTemplateNames(getTaskDir(n)).length > 0)
    ) {
      console.log();
      logger.success("Prompt templates — all valid");
    }

    // Summary
    console.log();
    if (issues === 0) {
      logger.success(`All checks passed (${healthy} task${healthy !== 1 ? "s" : ""}).`);
    } else {
      logger.warn(`${healthy} healthy, ${issues} issue${issues !== 1 ? "s" : ""}.`);
    }
  });
// ── Parse ────────────────────────────────────────────────────────────────────

program.parse();
