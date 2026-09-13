import { createHash } from "node:crypto";

export function applicationPayload(event) {
  const draft = event.draft;
  return {
    // Stable 52-bit identifier, safe in JavaScript/SQLite and across restarts.
    sourceUpdateId: Number.parseInt(createHash('sha256').update(event.key).digest('hex').slice(0, 13), 16),
    flowId: event.key.replace(/^application-/, ''),
    chatId: String(event.userId), telegramUserId: String(event.userId),
    telegramUsername: event.username || null,
    name: draft.name, phone: draft.phone, age: Number(draft.age),
    experience: draft.experience, citizenshipCity: draft.citizenshipCity,
    equipment: draft.equipment, onlineReady: draft.onlineReadiness,
    employmentStatus: draft.employmentStatus, vacancyId: event.vacancyId,
  };
}

// admin.json is the durable outbox. Polling calls this under bot.exclusive,
// so saves cannot race with candidate submission or admin status changes.
export async function flushCrm(bot, now = Date.now()) {
  const url = String(bot.config.CRM_SYNC_URL || '').trim();
  const secret = String(bot.config.CRM_SYNC_SECRET || '').trim();
  if (!url || !secret) return;
  if (new URL(url).protocol !== 'https:') throw new Error('CRM endpoint requires HTTPS');
  const data = await bot.admin.load();
  const pending = data.events.filter(e => e.type === 'application' && e.draft && !e.crmSyncedAt && (e.crmRetryAt || 0) <= now).slice(0, 5);
  for (const event of pending) {
    try {
      const response = await fetch(url, {
        method: 'POST', redirect: 'error',
        headers: { 'content-type': 'application/json', 'x-crm-sync-secret': secret },
        body: JSON.stringify(applicationPayload(event)), signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error('CRM rejected request');
      const result = await response.json();
      if (!result.ok || !Number.isSafeInteger(result.id)) throw new Error('Invalid CRM acknowledgement');
      event.crmSyncedAt = new Date(now).toISOString();
      event.crmApplicationId = result.id;
      delete event.crmRetryAt;
      await bot.admin.save(data);
    } catch {
      event.crmAttempts = (event.crmAttempts || 0) + 1;
      event.crmRetryAt = now + Math.min(3600000, 30000 * 2 ** Math.min(event.crmAttempts - 1, 7));
      await bot.admin.save(data);
      console.error('CRM delivery pending; saved application will be retried.');
      break;
    }
  }
}
