import "./instrument.js";

import * as Sentry from "@sentry/node";

export function initMonitoring() {
  process.on("uncaughtException", (err) => {
    Sentry.captureException(err);
    console.error("UNCAUGHT EXCEPTION:", err);
  });

  process.on("unhandledRejection", (err) => {
    Sentry.captureException(err);
    console.error("UNHANDLED REJECTION:", err);
  });
}
