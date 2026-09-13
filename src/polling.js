import { setTimeout as delay } from "node:timers/promises";
import { flushCrm } from "./crm.js";

export async function runPolling(bot, signal) {
  let initialized = false;
  let offset;
  while (!signal.aborted) {
    try {
      if (!initialized) {
        await bot.telegramRequest("deleteWebhook", { drop_pending_updates: false }, signal);
        initialized = true;
        console.log("Telegram HR bot long polling started");
      }
      const updates = await bot.telegramRequest("getUpdates", {
        offset, timeout: 30, allowed_updates: ["message", "callback_query"],
      }, signal);
      for (const update of updates) {
        if (signal.aborted) return;
        if (bot.exclusive) await bot.exclusive(() => bot.handleUpdate(update));
        else await bot.handleUpdate(update);
        offset = update.update_id + 1;
      }
      const maintenance = async () => { await bot.training?.tick(); await bot.admin?.flush(); if (bot.config) await flushCrm(bot); };
      if (bot.exclusive) await bot.exclusive(maintenance); else await maintenance();
    } catch (error) {
      if (signal.aborted) return;
      // Never log request URLs or tokens.
      console.error(`Polling failed (code ${error.code ?? "network"}); retrying.`,
        error.code === 409 ? "Stop other instances and disable hosting webhook registration." : "");
      await delay(Math.max(5000, (error.retryAfter ?? 0) * 1000), undefined, { signal }).catch(() => {});
    }
  }
}
