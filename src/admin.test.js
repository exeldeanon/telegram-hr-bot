import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { TelegramHrBot } from "./bot.js";
import { VACANCIES } from "./vacancies.js";

test("candidate funnel, admin authorization, persistence and notification retry", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "hr-admin-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const config = { DATA_DIR: dir, ADMIN_TELEGRAM_ID: "99" };
  const bot = new TelegramHrBot(config);
  const sent = [];
  let failAdmin = false;
  bot.telegramRequest = async (method, payload) => {
    if (failAdmin && String(payload.chat_id) === "99") throw Object.assign(new Error("blocked"), { code: 403 });
    sent.push({ method, ...payload });
    return true;
  };
  let messageId = 0;
  const message = (text, id = 1, type = "private") => bot.handleUpdate({ message: {
    message_id: ++messageId, text, from: { id, username: "tester" }, chat: { id, type },
  } });
  const callback = (data) => bot.handleUpdate({ callback_query: {
    id: String(++messageId), data, from: { id: 1 }, message: { chat: { id: 1, type: "private" } },
  } });
  await message("/start source");
  await callback("consent:accept");
  for (const value of ["Иван", "89991234567", "25", "нет", "Россия, Москва", "ноутбук", "да", "ничего"]) await message(value);
  const vacancy = Object.keys(VACANCIES)[0];
  await callback(`vacancy:${vacancy}`);
  await callback("vacancies:back");
  assert.equal((await bot.loadState(1)).step, "awaiting_vacancy");
  await callback(`vacancy:${vacancy}`);
  await callback(`application:submit:${vacancy}`);
  await callback(`application:submit:${vacancy}`);
  const { events } = await bot.admin.load();
  assert.deepEqual(events.map((e) => e.type), ["visit", "started", "application"]);
  assert.equal(events[2].text.includes("Иван"), true);
  await message("/admin");
  assert.equal(sent.at(-1).text, "Нет доступа к админке.");
  await message("/application 3");
  assert.equal(sent.at(-1).text, "Нет доступа к админке.");
  await callback("admin:item:3");
  assert.equal(sent.at(-1).text, "Нет доступа к админке.");
  await message("/admin", 99, "group");
  assert.equal(sent.at(-1).text, "Нет доступа к админке.");
  await message("/admin", 99);
  assert.match(sent.at(-1).text, /Подано заявок: 1/);
  assert.equal(sent.at(-1).reply_markup.inline_keyboard[1][0].callback_data, "admin:list:1");
  await message("/application 3", 99);
  assert.match(sent.at(-1).text, /Иван/);
  failAdmin = true;
  await bot.admin.flush();
  assert.equal((await bot.admin.load()).events.some((e) => e.delivered), false);
  failAdmin = false;
  await bot.admin.flush();
  assert.equal((await new TelegramHrBot(config).admin.load()).events.every((e) => e.delivered), true);
  const count = sent.length;
  await bot.admin.flush();
  assert.equal(sent.length, count);
  await message("/restart");
  assert.equal((await bot.admin.load()).events.filter((e) => e.type === "application").length, 1);
});

test("admin disabled by default", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "hr-admin-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const bot = new TelegramHrBot({ DATA_DIR: dir });
  let result;
  bot.sendMessage = async (_id, text) => { result = text; };
  await bot.admin.command({ from: { id: 1 }, chat: { id: 1, type: "private" } }, "/admin");
  assert.equal(result, "Нет доступа к админке.");
});
