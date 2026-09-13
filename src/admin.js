import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { adminMenu, button, keyboard } from "./ui.js";
import { STATUSES } from './training.js';

export class Admin {
  constructor(bot) {
    this.bot = bot;
    this.file = path.join(bot.storageDir, "admin.json");
    this.id = String(bot.config.ADMIN_TELEGRAM_ID || "");
    if (this.id && !/^[1-9][0-9]*$/.test(this.id)) throw new Error("ADMIN_TELEGRAM_ID must be a positive numeric Telegram user ID");
  }
  async load() {
    try { return JSON.parse(await readFile(this.file, "utf8")); }
    catch (error) { if (error.code === "ENOENT") return { events: [] }; throw error; }
  }
  async save(data) {
    await mkdir(this.bot.storageDir, { recursive: true });
    await writeFile(`${this.file}.tmp`, JSON.stringify(data), "utf8");
    await rename(`${this.file}.tmp`, this.file);
  }
  async record(key, type, user, text = "", extra = {}) {
    const data = await this.load();
    let event = data.events.find((item) => item.key === key);
    if (!event) {
      event = { key, id: data.events.length + 1, type, userId: user.id,
        username: user.username || data.events.findLast((e) => e.userId === user.id && e.username)?.username || "", at: new Date().toISOString(), text, delivered: false, ...extra };
      data.events.push(event);
      await this.save(data);
    }
    return event;
  }
  async flush() {
    if (!this.id) return;
    const data = await this.load();
    for (const event of data.events.filter((item) => !item.delivered).slice(0, 10)) {
      const label = { visit: "👋 Пользователь запустил бота", started: "✍️ Начал заполнять анкету", application: "📨 Новая заявка", training: '🎓 Результат обучения' }[event.type];
      const text = `${label} · №${event.id}\n${event.username ? `@${event.username} · ` : ""}ID: ${event.userId}\n${event.at}\n\n${event.text}`;
      try {
        await this.bot.sendMessage(this.id, text, event.type === "application" ? keyboard([button("📄 Открыть заявку", `admin:item:${event.id}`)], [button("📊 Статистика", "admin:stats")]) : adminMenu());
        event.delivered = true;
        await this.save(data);
      } catch (error) {
        console.error(`Admin notification pending (code ${error.code ?? "network"})`);
        break;
      }
    }
  }
  async command(message, text) {
    const [command, arg] = text.split(/\s+/);
    if (command === "/myid") {
      await this.bot.sendMessage(message.chat.id, `Ваш Telegram ID: ${message.from.id}`);
      return true;
    }
    if (!["/admin", "/applications", "/application"].includes(command)) return false;
    if (!this.id || String(message.from.id) !== this.id || message.chat.type !== "private") {
      await this.bot.sendMessage(message.chat.id, "Нет доступа к админке.");
      return true;
    }
    const { events } = await this.load();
    const applications = events.filter((event) => event.type === "application");
    if (command === "/admin") {
      const day = (at) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(new Date(at));
      const today = events.filter((event) => day(event.at) === day(Date.now()));
      const stats = (items) => `Запустили бота: ${new Set(items.filter((e) => e.type === "visit").map((e) => e.userId)).size}\nНачали анкету: ${new Set(items.filter((e) => e.type === "started").map((e) => e.userId)).size}\nПодано заявок: ${items.filter((e) => e.type === "application").length}`;
      await this.bot.sendMessage(this.id, `HR PRIME · ПАНЕЛЬ УПРАВЛЕНИЯ\n\n📊 За всё время\n${stats(events)}\n\n☀️ Сегодня (Москва)\n${stats(today)}\n\n🔔 Ожидают уведомления: ${events.filter((e) => !e.delivered).length}\n\nЗапуски и начала — уникальные пользователи за период. Учёт с момента установки обновления.`, adminMenu());
    } else if (command === "/applications") {
      const pages = Math.max(1, Math.ceil(applications.length / 10));
      const page = Math.min(pages, Math.max(1, Number.parseInt(arg, 10) || 1));
      const items = applications.slice().reverse().slice((page - 1) * 10, page * 10);
      const controls = items.map((e) => [button(`📄 Заявка №${e.id}`, `admin:item:${e.id}`)]);
      const navigation = [];
      if (page > 1) navigation.push(button("‹ Назад", `admin:list:${page - 1}`));
      if (page < pages) navigation.push(button("Далее ›", `admin:list:${page + 1}`));
      if (navigation.length) controls.push(navigation);
      controls.push([button("📊 В админку", "admin:stats")]);
      await this.bot.sendMessage(this.id, `📂 ЗАЯВКИ · ${applications.length}\nСтраница ${page}/${pages}\n\n${items.map((e) => `№${e.id} · ${e.at.slice(0, 10)} · ID ${e.userId}`).join("\n\n") || "Пока нет заявок."}\n\nВыберите карточку ниже.`, keyboard(...controls));
    } else {
      const event = applications.find((item) => String(item.id) === arg);
      await this.bot.sendMessage(this.id, event ? this.card(event) : 'Заявка не найдена.', event ? this.controls(event) : adminMenu());
    }
    if (command === '/admin' && this.bot.miniAppKeyboard()) await this.bot.sendMessage(this.id, '✨ Заявки и обучение в миниапке', this.bot.miniAppKeyboard());
    return true;
  }
  card(e) {
    const hours = (at) => Math.max(0, Math.floor((Date.now() - new Date(at).getTime()) / 3600000));
    return `Заявка №${e.id}\n${e.username ? '@' + e.username : 'Username не задан'} · ID: ${e.userId}\nСтатус: ${STATUSES[e.status || 'filled']}\nВозраст заявки: ${hours(e.at)} ч.${e.status === 'hold' ? `\nВ холде: ${hours(e.statusAt || e.at)} ч.` : ''}\nОбучение: ${e.training ? `${e.training.days.filter((d) => d.result?.passed).length}/5 зачтено` : 'не назначено'}\n\n${e.text}`;
  }
  controls(e) {
    return keyboard([button(e.training ? '🎓 Обучение назначено' : '🎓 Отправить на обучение', `admin:enroll:${e.id}`)],
      ...Object.entries(STATUSES).map(([key, label]) => [button(`${e.status === key ? '• ' : ''}${label}`, `admin:status:${e.id}:${key}`)]),
      [button('📂 К заявкам', 'admin:list:1')], ...(this.bot.miniAppKeyboard()?.inline_keyboard || []));
  }
  async action(callback) {
    const [, action, id, value] = callback.data.split(':');
    if (!['enroll', 'status'].includes(action)) return false;
    if (!this.id || String(callback.from.id) !== this.id || callback.message.chat.type !== 'private') {
      await this.bot.sendMessage(callback.message.chat.id, 'Нет доступа к админке.'); return true;
    }
    try {
      const e = action === 'enroll' ? await this.bot.training.enroll(id) : await this.bot.training.status(id, value);
      await this.bot.sendMessage(this.id, this.card(e), this.controls(e));
    } catch (error) { if (!error.status) throw error; await this.bot.sendMessage(this.id, error.message); }
    return true;
  }
}
