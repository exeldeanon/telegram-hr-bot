import { createServer } from "node:http";
import { TelegramHrBot } from "./bot.js";
import { runPolling } from "./polling.js";
import { miniAppHandler } from './miniapp.js';
import { crmTrainingHandler } from './crm-training.js';

for (const key of ["TELEGRAM_BOT_TOKEN", "HR_MANAGER_USERNAME", "POLICY_URL", "PERSONAL_DATA_URL"]) {
  if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`);
}
const bot = new TelegramHrBot(process.env);
const controller = new AbortController();
const port = Number(process.env.PORT ?? 3000);
const handleMiniApp = miniAppHandler(bot);
const handleCrmTraining = crmTrainingHandler(bot);
const server = createServer(async (request, response) => {
  if (await handleCrmTraining(request, response)) return;
  if (await handleMiniApp(request, response)) return;
  const ok = request.method === "GET" && request.url === "/";
  response.writeHead(ok ? 200 : 404, { "content-type": "application/json" });
  response.end(JSON.stringify(ok ? { ok: true, service: "telegram-hr-bot", mode: "polling" } : { ok: false }));
});
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.once(signal, () => { controller.abort(); server.close(); });
}
server.listen(port, "0.0.0.0", () => {
  console.log(`Telegram HR bot health server is listening on port ${port}`);
  console.log('UpHire clickable legal links enabled (v5)');
  runPolling(bot, controller.signal).catch(() => {
    console.error("Polling stopped unexpectedly");
    process.exitCode = 1;
    server.close();
  });
});
