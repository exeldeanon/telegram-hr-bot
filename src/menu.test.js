import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TelegramHrBot } from './bot.js';
import { homeKeyboard, homeText, infoPages } from './menu.js';
import { VACANCIES } from './vacancies.js';

async function fixture(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'uphire-menu-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const bot = new TelegramHrBot({ DATA_DIR: dir, HR_MANAGER_USERNAME: 'UpHireManager', POLICY_URL: 'https://example.test/privacy', PERSONAL_DATA_URL: 'https://example.test/consent' });
  const sent = []; let id = 0;
  bot.telegramRequest = async (method, payload) => { sent.push({ method, ...payload }); return { message_id: 100 }; };
  bot.sendPhoto = async (chatId, caption, reply_markup, asset = 'home') => { sent.push({ method: 'sendPhoto', chat_id: chatId, caption, reply_markup, asset }); return { message_id: 100 }; };
  bot.editPhoto = async (chatId, messageId, asset, caption, reply_markup) => { sent.push({ method: 'editPhoto', chat_id: chatId, message_id: messageId, caption, reply_markup, asset }); return { message_id: messageId }; };
  const message = text => bot.handleUpdate({ message: { message_id: ++id, text, from: { id: 1 }, chat: { id: 1, type: 'private' } } });
  const click = (data, photo = false) => bot.handleUpdate({ callback_query: { id: String(++id), data, from: { id: 1 }, message: { message_id: 100, chat: { id: 1, type: 'private' }, ...(photo ? { photo: [{}] } : {}) } } });
  return { bot, sent, message, click };
}

test('start offers branded menu; navigation leaves drafts intact', async t => {
  const { bot, sent, message, click } = await fixture(t);
  const state = { step: 'awaiting_phone', draft: { name: 'Анна' }, vacancyId: 'chat_operator', session: 'preserve' };
  await bot.saveState(1, state);
  await message('/start source'); assert.equal(sent.at(-1).method, 'sendPhoto');
  assert.deepEqual(await bot.loadState(1), state);
  const buttons = sent.at(-1).reply_markup.inline_keyboard.flat();
  assert.ok(buttons.some(b => b.url === 'https://up-hire.ru'));
  assert.ok(!buttons.some(b => b.url === 'https://up-hire.ru/policy'));
  assert.ok(!buttons.some(b => b.url === 'https://up-hire.ru/personal-data'));
  assert.match(homeText, /https:\/\/up-hire\.ru\/policy/);
  assert.match(homeText, /https:\/\/up-hire\.ru\/personal-data/);
  assert.match(homeText, /<a href="https:\/\/up-hire\.ru\/policy">Политика конфиденциальности<\/a>/);
  assert.ok(buttons.some(b => b.callback_data === 'menu:faq'));
  assert.ok(!buttons.some(b => b.callback_data === 'menu:how'));
  for (const page of ['about', 'how', 'faq', 'vacancies', 'manager', 'training', 'home']) {
    await click(`menu:${page}`, true);
    assert.deepEqual(await bot.loadState(1), state);
    assert.ok(sent.at(-1).reply_markup.inline_keyboard.flat().length);
    assert.equal(sent.at(-1).asset, page === 'home' ? 'home' : page === 'how' ? 'faq' : page);
  }
  await click('menu:apply', true); assert.deepEqual(await bot.loadState(1), state);
  assert.equal(sent.at(-1).asset, 'vacancies');
  await click('menu:apply:insurance_agent'); assert.deepEqual(await bot.loadState(1), state);
  await click('menu:application'); assert.match(sent.at(-1).text, /номер телефона/);
  await message('/restart'); assert.deepEqual(await bot.loadState(1), state);
  await click('menu:replace:insurance_agent'); assert.equal((await bot.loadState(1)).step, 'awaiting_consent');
  assert.equal((await bot.loadState(1)).vacancyId, 'insurance_agent');
  assert.deepEqual((await bot.loadState(1)).draft, {});
});

test('vacancy-first application still requires consent and reaches durable submission', async t => {
  const { bot, sent, message, click } = await fixture(t);
  await message('/start'); assert.equal((await bot.loadState(1)).step, 'idle');
  await click('menu:job:chat_operator', true); assert.match(sent.at(-1).caption || sent.at(-1).text, /Оператор чата/);
  await click('menu:apply:chat_operator'); assert.equal((await bot.loadState(1)).step, 'awaiting_consent');
  assert.match(sent.at(-1).caption || sent.at(-1).text, /up-hire\.ru\/policy/);
  assert.match(sent.at(-1).caption || sent.at(-1).text, /up-hire\.ru\/personal-data/);
  await message('Анна'); assert.equal((await bot.loadState(1)).step, 'awaiting_consent');
  await click('consent:accept'); await message('Анна');
  assert.equal((await bot.loadState(1)).step, 'awaiting_vacancy_confirmation');
  await click('application:continue');
  for (const text of ['89991234567', '25', 'нет', 'Москва', 'ПК', 'да', 'ничего']) await message(text);
  assert.equal((await bot.loadState(1)).step, 'awaiting_submission');
  await click('application:submit:chat_operator');
  await click('menu:application'); assert.match(sent.at(-1).text, /Анкета кандидата/);
  assert.ok(sent.some(item => item.asset === 'application'));
  await message('/start'); assert.equal((await bot.loadState(1)).step, 'completed');
  assert.equal((await bot.admin.load()).events.filter(e => e.type === 'application').length, 1);
});

test('buttons meet Telegram limits; invalid manager has safe fallback', async t => {
  const { bot, sent, click } = await fixture(t);
  assert.ok(homeText.length <= 1024);
  for (const text of Object.values(infoPages)) assert.ok(text.length <= 1024);
  for (const row of homeKeyboard().inline_keyboard) for (const b of row) if (b.callback_data) assert.ok(Buffer.byteLength(b.callback_data) <= 64);
  for (const id of Object.keys(VACANCIES)) assert.ok(Buffer.byteLength(`menu:apply:${id}`) <= 64);
  bot.config.HR_MANAGER_USERNAME = 'bad/path'; await click('menu:manager');
  assert.equal(sent.at(-1).reply_markup.inline_keyboard[0][0].url, 'https://up-hire.ru');
  await click('menu:job:unknown'); assert.match(sent.at(-1).caption, /нет в каталоге/);
});

test('home banner is uploaded as multipart; image failure falls back to usable menu', async t => {
  const { bot, sent } = await fixture(t);
  const bannerNames = ['home', 'vacancies', 'about', 'how', 'manager', 'application', 'faq', 'training'];
  for (const name of bannerNames) {
    const banner = await readFile(new URL(`../assets/banner-${name}.png`, import.meta.url));
    assert.ok(banner.length > 100000); assert.deepEqual([...banner.subarray(0, 4)], [137, 80, 78, 71]);
  }
  bot.sendPhoto = TelegramHrBot.prototype.sendPhoto;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.ok(url.endsWith('/sendPhoto')); assert.ok(options.body instanceof FormData);
    assert.equal(options.body.get('photo').type, 'image/png');
    assert.equal(options.body.get('caption'), homeText);
    assert.equal(options.body.get('parse_mode'), 'HTML');
    return { ok: true, json: async () => ({ ok: true, result: { message_id: 3 } }) };
  });
  assert.equal((await bot.sendWelcome(1)).message_id, 3);
  bot.sendPhoto = async () => { throw Object.assign(new Error('test'), { code: 400 }); };
  await bot.sendWelcome(1); assert.equal(sent.at(-1).method, 'sendMessage'); assert.equal(sent.at(-1).text, homeText);
});

test('unmodified panel is harmless and long photo caption becomes a text panel', async t => {
  const { bot, sent, click } = await fixture(t);
  bot.editPhoto = async () => { throw Object.assign(new Error('unchanged'), { code: 400, notModified: true }); };
  await click('menu:home', true); assert.equal(sent.at(-1).method, 'answerCallbackQuery');
  await bot.showPanel({ message: { chat: { id: 1 }, message_id: 100, photo: [{}] } }, 'x'.repeat(1200), homeKeyboard());
  assert.equal(sent.at(-1).method, 'sendMessage');
});

test('candidate UI deletes typed input and replaces the previous active message', async t => {
  const { bot, sent } = await fixture(t);
  await bot.withCandidateUi(1, 10, () => bot.sendMessage(1, 'Первый экран'));
  await bot.withCandidateUi(1, 11, () => bot.sendMessage(1, 'Второй экран'));
  const deleted = sent.filter(item => item.method === 'deleteMessage').map(item => item.message_id);
  assert.deepEqual(deleted, [10, 11, 100]);
  assert.equal(sent.at(-1).text, 'Второй экран');
});
