import Parser from "rss-parser";
import { DEFAULT_FEEDS } from "./automations/cron-manager/tasks/rss-fetcher/feeds-radar-saas.js";

const parser = new Parser({
  timeout: 15000,
});

(async () => {
  for (const feed of DEFAULT_FEEDS) {
    try {
      const rss = await parser.parseURL(feed.url);

      console.log(
        `✅ ${feed.name}\n` + `   ${feed.url}\n` + `   Itens: ${rss.items?.length ?? 0}\n`,
      );
    } catch (err) {
      console.log(`❌ ${feed.name}\n` + `   ${feed.url}\n` + `   ${err.message}\n`);
    }
  }
})();
