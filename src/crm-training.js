import { createHash, timingSafeEqual } from 'node:crypto';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };

async function readBody(request) {
  if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) fail('Content-Type must be application/json', 415);
  let text = '';
  for await (const chunk of request) {
    text += chunk;
    if (text.length > 8192) fail('Request body is too large', 413);
  }
  try { return JSON.parse(text || '{}'); }
  catch { fail('Malformed JSON'); }
}

function authorized(received, expected) {
  if (!expected || !received) return false;
  const a = createHash('sha256').update(String(received)).digest();
  const b = createHash('sha256').update(String(expected)).digest();
  return timingSafeEqual(a, b);
}

export function crmTrainingHandler(bot) {
  return async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname !== '/api/crm/training') return false;
    const send = (status, value) => {
      response.writeHead(status, {
        'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
        'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
      });
      response.end(JSON.stringify(value));
    };
    try {
      if (request.method !== 'POST') fail('Method not allowed', 405);
      if (!authorized(request.headers['x-crm-sync-secret'], String(bot.config.CRM_SYNC_SECRET || '').trim())) fail('Unauthorized', 401);
      const input = await readBody(request);
      if (!['status', 'enroll'].includes(input.action)) fail('Unknown action');
      if (!Number.isSafeInteger(input.applicationId) || input.applicationId <= 0) fail('Invalid application ID');
      if (input.flowId !== undefined && (typeof input.flowId !== 'string' || input.flowId.length < 1 || input.flowId.length > 150)) fail('Invalid flow ID');
      const result = await bot.exclusive(async () => {
        const { event } = await bot.training.getByCrmApplication(input.applicationId, input.flowId);
        if (input.action === 'enroll') await bot.training.enroll(event.id);
        const latest = (await bot.training.get(event.id)).event;
        return bot.training.summary(latest);
      });
      send(200, { ok: true, training: result });
    } catch (error) {
      send(error.status || 500, { ok: false, error: { message: error.status ? error.message : 'Training service unavailable' } });
    }
    return true;
  };
}
