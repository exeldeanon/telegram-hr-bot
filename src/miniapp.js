import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { STATUSES, NOTICE } from './training.js';
import { VACANCIES } from './vacancies.js';

export function verifyInitData(raw, token, now = Date.now()) {
  if (!raw || raw.length > 16000) throw Object.assign(new Error('Откройте миниапку из Telegram'), { status: 401 });
  const params = new URLSearchParams(raw);
  if ([...params.keys()].length !== new Set(params.keys()).size) throw Object.assign(new Error('Некорректная авторизация'), { status: 401 });
  const hash = params.get('hash'); params.delete('hash');
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b, 'en')).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const expected = createHmac('sha256', secret).update(check).digest();
  if (!/^[a-f0-9]{64}$/.test(hash || '') || !timingSafeEqual(expected, Buffer.from(hash, 'hex'))) throw Object.assign(new Error('Недействительная подпись Telegram'), { status: 401 });
  const date = Number(params.get('auth_date')) * 1000;
  if (!date || now - date > 3600000 || date > now + 30000) throw Object.assign(new Error('Сессия истекла. Закройте и откройте миниапку'), { status: 401 });
  const user = JSON.parse(params.get('user') || '{}');
  if (!Number.isSafeInteger(user.id) || user.id <= 0) throw Object.assign(new Error('Пользователь не определён'), { status: 401 });
  return user;
}
async function body(request) {
  let text = '';
  for await (const chunk of request) { text += chunk; if (text.length > 16000) throw Object.assign(new Error('Слишком большой запрос'), { status: 413 }); }
  return JSON.parse(text || '{}');
}
export function miniAppHandler(bot) {
  const files = { '/app': ['index.html', 'text/html'], '/app/': ['index.html', 'text/html'], '/app/app.js': ['app.js', 'text/javascript'], '/app/style.css': ['style.css', 'text/css'] };
  return async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const send = (status, value) => { response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); response.end(JSON.stringify(value)); };
    try {
      if (files[url.pathname] && request.method === 'GET') {
        const [file, type] = files[url.pathname];
        const content = await readFile(new URL(`../miniapp/${file}`, import.meta.url));
        response.writeHead(200, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'self'; script-src 'self' https://telegram.org; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; object-src 'none'" });
        response.end(content); return true;
      }
      if (!url.pathname.startsWith('/api/')) return false;
      const user = verifyInitData(request.headers['x-telegram-init-data'], bot.config.TELEGRAM_BOT_TOKEN);
      const admin = String(user.id) === bot.admin.id;
      const input = request.method === 'POST' ? await body(request) : {};
      const result = await bot.exclusive(async () => {
        if (url.pathname === '/api/me' && request.method === 'GET') {
          const data = await bot.admin.load();
          const applications = data.events.filter((e) => e.type === 'application' && (admin || e.userId === user.id));
          return { user, admin, applications, statuses: STATUSES, vacancies: Object.fromEntries(Object.entries(VACANCIES).map(([k, v]) => [k, v.title])), notice: NOTICE };
        }
        if (url.pathname === '/api/lesson' && request.method === 'GET') {
          const { event } = await bot.training.get(url.searchParams.get('id'));
          if (!admin) bot.training.checkOwner(event, user.id);
          return bot.training.viewDay(event, Number(url.searchParams.get('day')));
        }
        if (url.pathname === '/api/action' && request.method === 'POST') {
          if (['status', 'enroll'].includes(input.action)) {
            if (!admin) throw Object.assign(new Error('Нет доступа'), { status: 403 });
            return input.action === 'status' ? bot.training.status(input.id, input.status) : bot.training.enroll(input.id);
          }
          if (input.action === 'read') return bot.training.read(input.id, input.day, user.id);
          if (input.action === 'retry') return bot.training.retry(input.id, input.day, user.id);
          if (input.action === 'submit') return bot.training.submit(input.id, input.day, user.id, input.answers, input.attempt);
        }
        throw Object.assign(new Error('Не найдено'), { status: 404 });
      });
      send(200, result);
    } catch (error) {
      send(error.status || (error instanceof SyntaxError ? 400 : 500), { error: error.status ? error.message : 'Не удалось обработать запрос' });
    }
    return true;
  };
}
