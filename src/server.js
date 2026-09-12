import { createServer } from "node:http";
import { TelegramHrBot } from "./bot.js";

const requiredEnv = [
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
  "HR_MANAGER_USERNAME",
  "POLICY_URL",
  "PERSONAL_DATA_URL",
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const bot = new TelegramHrBot(process.env);
const port = Number(process.env.PORT ?? 3000);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    if (request.method === "GET" && url.pathname === "/") {
      return sendJson(response, 200, { ok: true, service: "telegram-hr-bot" });
    }

    if (request.method !== "POST" || url.pathname !== "/webhook") {
      return sendJson(response, 404, { ok: false, error: "not_found" });
    }

    const secret = request.headers["x-telegram-bot-api-secret-token"];

    if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
      return sendJson(response, 401, { ok: false, error: "unauthorized" });
    }

    const update = JSON.parse(await readRequestBody(request));
    await bot.handleUpdate(update);

    return sendJson(response, 200, { ok: true });
  } catch (error) {
    console.error(error);
    return sendJson(response, 500, { ok: false, error: "internal_error" });
  }
});

server.listen(port, () => {
  console.log(`Telegram HR bot is listening on port ${port}`);
});

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}
