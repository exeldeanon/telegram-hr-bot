import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TelegramHrBot } from './bot.js';
import { crmTrainingHandler } from './crm-training.js';
import { QUIZZES } from './quizzes.js';

test('CRM can securely assign training and read attempt-level progress', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'uphire-crm-training-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const bot = new TelegramHrBot({ DATA_DIR: dir, CRM_SYNC_SECRET: 'shared-test-secret' });
  bot.sendDocument = async () => true;
  const application = await bot.admin.record('application-flow-1', 'application', { id: 42, username: 'candidate' }, 'Анкета', {
    vacancyId: 'chat_operator', status: 'filled', crmApplicationId: 7,
  });
  const handler = crmTrainingHandler(bot);
  const server = createServer(async (request, response) => { if (!await handler(request, response)) { response.writeHead(404); response.end(); } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (body, secret = 'shared-test-secret') => fetch(`${base}/api/crm/training`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-crm-sync-secret': secret }, body: JSON.stringify(body),
  });

  assert.equal((await call({ action: 'status', applicationId: 7 }, 'wrong')).status, 401);
  let response = await call({ action: 'status', applicationId: 7 });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).training.assigned, false);
  response = await call({ action: 'enroll', applicationId: 7 });
  const enrolled = (await response.json()).training;
  assert.equal(enrolled.assigned, true); assert.equal(enrolled.currentDay, 1); assert.equal(enrolled.testsPassed, 0);

  await bot.training.tick();
  await bot.training.read(application.id, 0, 42);
  const wrong = QUIZZES.chat_operator[0].map((question) => (question.answer + 1) % 3);
  await bot.training.submit(application.id, 0, 42, wrong, 0);
  await bot.training.retry(application.id, 0, 42);
  await bot.training.submit(application.id, 0, 42, QUIZZES.chat_operator[0].map((question) => question.answer), 1);
  response = await call({ action: 'status', applicationId: 7 });
  const progress = (await response.json()).training;
  assert.equal(progress.testsPassed, 1); assert.equal(progress.testsAttempted, 1); assert.equal(progress.attemptsTotal, 2);
  assert.equal(progress.days[0].state, 'passed'); assert.equal(progress.days[0].passedOnAttempt, 2);
  assert.equal(progress.days[1].state, 'locked');
});
