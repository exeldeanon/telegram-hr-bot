import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applicationPayload, flushCrm } from './crm.js';

const event = () => ({ key: 'application-123-45', userId: 123, username: 'test', type: 'application', vacancyId: 'chat_operator', draft: { name: 'Тест', phone: '+70000000000', age: '25', experience: 'Нет', citizenshipCity: 'Тест', equipment: 'ПК', onlineReadiness: 'Да', employmentStatus: 'Нет' } });
test('stable IDs and payload map the existing bot draft', () => {
  const payload = applicationPayload(event());
  assert.equal(payload.sourceUpdateId, applicationPayload(event()).sourceUpdateId);
  assert.ok(Number.isSafeInteger(payload.sourceUpdateId));
  assert.equal(payload.age, 25); assert.equal(payload.onlineReady, 'Да');
  assert.notEqual(applicationPayload({ ...event(), key: 'application-123-46' }).sourceUpdateId, payload.sourceUpdateId);
});
test('persistent retry, restart, acknowledgement and no repeated successful sends', async t => {
  let saved = { events: [event()] }; let sends = 0;
  const makeBot = () => ({ config: { CRM_SYNC_URL: 'https://example.invalid/api', CRM_SYNC_SECRET: 'test-only' }, admin: {
    load: async () => structuredClone(saved), save: async value => { saved = structuredClone(value); },
  } });
  t.mock.method(globalThis, 'fetch', async () => { sends++; throw new Error('offline'); });
  await flushCrm(makeBot(), 1000);
  assert.ok(saved.events[0].crmRetryAt > 1000); assert.equal(saved.events[0].crmSyncedAt, undefined);
  await flushCrm(makeBot(), 2000); assert.equal(sends, 1);
  globalThis.fetch.mock.mockImplementation(async () => { sends++; return { ok: true, json: async () => ({ ok: true, duplicate: true, id: 7 }) }; });
  await flushCrm(makeBot(), 61000); assert.equal(saved.events[0].crmApplicationId, 7);
  await flushCrm(makeBot(), 121000); assert.equal(sends, 2);
});
test('missing configuration does not lose applications; redirects and plain HTTP disallowed', async () => {
  await flushCrm({ config: {} });
  await assert.rejects(flushCrm({ config: { CRM_SYNC_URL: 'http://example.invalid', CRM_SYNC_SECRET: 'test' } }), /HTTPS/);
});
