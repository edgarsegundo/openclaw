import path from "path";
import { fileURLToPath } from "url";
import winston from "winston";
import "winston-daily-rotate-file";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const LOG_PATH = path.join(__dirname, "app.log");

export const logger = winston.createLogger({
  level: "debug",
  format: winston.format.combine(
    winston.format.timestamp({ format: "DD/MM/YYYY HH:mm:ss" }),
    winston.format.printf(({ timestamp, level, message }) => {
      return `[${String(timestamp)}] [${level.toUpperCase()}] ${String(message)}`;
    }),
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.DailyRotateFile({
      filename: path.join(__dirname, "logs", "visa-crawler-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      maxSize: "10m",
      maxFiles: "14d",
      tailable: true,
    }),
  ],
});
