import chalk from "chalk";

const logger = {
  info(msg) {
    console.log(chalk.blue("ℹ"), msg);
  },
  success(msg) {
    console.log(chalk.green("✔"), msg);
  },
  warn(msg) {
    console.log(chalk.yellow("⚠"), msg);
  },
  error(msg) {
    console.error(chalk.red("✖"), msg);
  },
  step(msg) {
    console.log(chalk.gray("  →"), msg);
  },
  header(msg) {
    console.log();
    console.log(chalk.bold.white(msg));
    console.log();
  },
  table(headers, rows) {
    const widths = headers.map((h, i) =>
      Math.max(h.length, ...rows.map((r) => String(r[i] ?? "—").length)),
    );

    const line = (cols) => cols.map((c, i) => String(c).padEnd(widths[i])).join("  ");

    console.log(chalk.bold(line(headers)));
    for (const row of rows) {
      console.log(line(row));
    }
  },
};

export default logger;
