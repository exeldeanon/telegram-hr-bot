import { test } from "node:test";
import assert from "node:assert/strict";
import { runPolling } from "./polling.js";
import { TelegramHrBot } from "./bot.js";

test("removes webhook, processes sequentially and acknowledges updates", async () => {
  const controller = new AbortController();
  const calls = [];
  const handled = [];
  await runPolling({
    async telegramRequest(method, payload) {
      calls.push({ method, payload });
      if (method === "deleteWebhook") return true;
      if (calls.length === 2) return [{ update_id: 41 }, { update_id: 42 }];
      controller.abort();
      return [];
    },
    async handleUpdate(update) { handled.push(update.update_id); },
  }, controller.signal);
  assert.deepEqual(handled, [41, 42]);
  assert.equal(calls[0].method, "deleteWebhook");
  assert.equal(calls[0].payload.drop_pending_updates, false);
  assert.equal(calls[2].payload.offset, 43);
});

test("API returns results and exposes error codes without token", async (t) => {
  const bot = new TelegramHrBot({ TELEGRAM_BOT_TOKEN: "test-secret" });
  t.mock.method(globalThis, "fetch", async () => ({
    ok: true, json: async () => ({ ok: true, result: [{ update_id: 1 }] }),
  }));
  assert.deepEqual(await bot.telegramRequest("getUpdates", {}), [{ update_id: 1 }]);
  globalThis.fetch.mock.mockImplementation(async () => ({
    ok: false, status: 409, json: async () => ({ ok: false, error_code: 409 }),
  }));
  await assert.rejects(bot.telegramRequest("getUpdates", {}), (error) =>
    error.code === 409 && !error.message.includes("test-secret"));
});
