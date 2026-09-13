import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { TelegramHrBot } from './bot.js';
import { DAY, COURSES } from './training.js';
import { QUIZZES } from './quizzes.js';
import { miniAppHandler, verifyInitData } from './miniapp.js';

function signed(id, date = Date.now(), token = 'test-token') {
  const p = new URLSearchParams({ auth_date: String(Math.floor(date / 1000)), user: JSON.stringify({ id, first_name: 'Test' }) });
  const check = [...p].sort(([a], [b]) => a < b ? -1 : 1).map(([k, v]) => `${k}=${v}`).join('\n');
  const key = createHmac('sha256', 'WebAppData').update(token).digest();
  p.set('hash', createHmac('sha256', key).update(check).digest('hex')); return p.toString();
}
async function fixture(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'hr-training-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const bot = new TelegramHrBot({ DATA_DIR: dir, ADMIN_TELEGRAM_ID: '99', TELEGRAM_BOT_TOKEN: 'test-token' });
  bot.sendMessage = async () => true; bot.sendDocument = async () => true;
  const app = await bot.admin.record('app', 'application', { id: 1, username: 'candidate' }, 'Анкета', { vacancyId: 'chat_operator', status: 'filled' });
  return { bot, app, dir };
}
test('20 imported courses and 60 complete questions', () => {
  assert.equal(Object.keys(COURSES).length, 4);
  for (const [key, days] of Object.entries(COURSES)) {
    assert.equal(days.length, 5);
    days.forEach((d, i) => {
      assert.ok(d.text.length > 1000); assert.ok(d.title.length > 5);
      assert.equal(QUIZZES[key][i].length, 3);
      for (const q of QUIZZES[key][i]) { assert.equal(new Set(q.options).size, 3); assert.ok(q.options[q.answer]); assert.ok(q.explanation); }
    });
  }
});
test('daily delivery, pause, retry, persistence, no duplicate enrollment', async (t) => {
  const { bot, app } = await fixture(t);
  const calls = []; bot.sendDocument = async (...args) => { calls.push(args); };
  await bot.training.enroll(app.id);
  const now = Date.now();
  await bot.training.tick(now); await bot.training.tick(now);
  assert.equal(calls.length, 1);
  await bot.training.enroll(app.id);
  await bot.training.tick(now + DAY - 1); assert.equal(calls.length, 1);
  await bot.training.status(app.id, 'hold'); await bot.training.tick(now + DAY); assert.equal(calls.length, 1);
  const holdAt = (await bot.training.get(app.id)).event.statusAt;
  await bot.training.status(app.id, 'hold'); assert.equal((await bot.training.get(app.id)).event.statusAt, holdAt);
  await bot.training.status(app.id, 'filled'); await bot.training.tick(now + DAY);
  assert.equal(calls.length, 2);
  await bot.training.tick(now + 10 * DAY); assert.equal(calls.length, 3); // no burst after downtime
  const restarted = new TelegramHrBot(bot.config); restarted.sendDocument = bot.sendDocument;
  await restarted.training.tick(now + 10 * DAY); assert.equal(calls.length, 3);
  restarted.sendDocument = async () => { throw Object.assign(new Error('blocked'), { code: 403 }); };
  await restarted.training.tick(now + 11 * DAY);
  assert.equal((await restarted.training.get(app.id)).event.training.days.length, 3);
  assert.match((await restarted.training.get(app.id)).event.training.deliveryError, /403/);
});
test('quiz access, acknowledgement, grading, stale attempts and completion', async (t) => {
  const { bot, app } = await fixture(t); await bot.training.enroll(app.id);
  const now = Date.now();
  for (let d = 0; d < 5; d++) await bot.training.tick(now + d * DAY);
  await assert.rejects(bot.training.read(app.id, 0, 2), { status: 403 });
  await assert.rejects(bot.training.read(app.id, 8, 1), { status: 400 });
  await assert.rejects(bot.training.submit(app.id, 0, 1, [0, 0, 0], 0), { status: 400 });
  const view = await bot.training.read(app.id, 0, 1);
  assert.equal(view.questions[0].answer, undefined); assert.equal(view.review, undefined);
  const wrong = QUIZZES.chat_operator[0].map((q) => (q.answer + 1) % 3);
  assert.equal((await bot.training.submit(app.id, 0, 1, wrong, 0)).result.passed, false);
  await bot.training.retry(app.id, 0, 1);
  await assert.rejects(bot.training.submit(app.id, 0, 1, wrong, 0), { status: 409 });
  for (let d = 0; d < 5; d++) {
    const r = await bot.training.read(app.id, d, 1);
    await bot.training.submit(app.id, d, 1, QUIZZES.chat_operator[d].map((q) => q.answer), r.attempt);
  }
  assert.ok((await bot.training.get(app.id)).event.training.completedAt);
  const count = (await bot.admin.load()).events.length;
  await bot.training.submit(app.id, 4, 1, QUIZZES.chat_operator[4].map((q) => q.answer), 0);
  assert.equal((await bot.admin.load()).events.length, count);
});
test('Telegram signature rejects spoofed, expired and duplicate fields', () => {
  const good = signed(99); assert.equal(verifyInitData(good, 'test-token').id, 99);
  assert.throws(() => verifyInitData(good, 'other-token'));
  assert.throws(() => verifyInitData(signed(99, Date.now() - 7200000), 'test-token'));
  assert.throws(() => verifyInitData(good + '&user={}', 'test-token'));
});
test('HTTP API enforces admin and ownership, private data not public', async (t) => {
  const { bot, app } = await fixture(t);
  const handler = miniAppHandler(bot);
  const server = createServer(async (req, res) => { if (!await handler(req, res)) { res.writeHead(404); res.end(); } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (url, id, input) => fetch(base + url, { headers: { 'x-telegram-init-data': id ? signed(id) : '' }, method: input ? 'POST' : 'GET', body: input ? JSON.stringify(input) : undefined });
  assert.equal((await request('/api/me')).status, 401);
  assert.equal((await (await request('/api/me', 2)).json()).applications.length, 0);
  assert.equal((await request('/api/action', 1, { action: 'enroll', id: app.id })).status, 403);
  assert.equal((await request('/api/action', 99, { action: 'enroll', id: app.id })).status, 200);
  await bot.training.tick();
  assert.equal((await request(`/api/lesson?id=${app.id}&day=0`, 2)).status, 403);
  assert.equal((await request(`/api/lesson?id=${app.id}&day=4`, 1)).status, 400);
  assert.equal((await request('/src/courses.json', 99)).status, 404);
  assert.equal((await request('/app')).status, 200);
});
