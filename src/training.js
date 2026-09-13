import { readFile } from "node:fs/promises";
import { QUIZZES } from "./quizzes.js";
import { VACANCIES } from "./vacancies.js";
import { button, keyboard } from "./ui.js";
export const COURSES = JSON.parse(await readFile(new URL('./courses.json', import.meta.url), 'utf8'));
export const STATUSES = { filled: 'Заполнил анкету', dropped: 'Слетел', hold: 'Холд', paid: 'Выплачено' };
export const DAY = 86400000;
export const NOTICE = 'Материал предоставлен HR Prime. Указанные тарифы, сроки, доходы и регламенты — учебные примеры, не подтверждённые условия работодателя. Не передавайте и не запрашивайте пароли, PIN, CVV и SMS-коды. Рабочие действия выполняйте только по актуальным регламентам.';
const fail = (text, status = 400) => { throw Object.assign(new Error(text), { status }); };
export class Training {
  constructor(bot) { this.bot = bot; }
  course(event) {
    return event.vacancyId || Object.keys(VACANCIES).find((key) => event.text?.includes(`Вакансия: ${VACANCIES[key].title}`));
  }
  async get(id) {
    const data = await this.bot.admin.load();
    const event = data.events.find((e) => e.type === 'application' && e.id === Number(id));
    if (!event) fail('Заявка не найдена', 404);
    return { data, event };
  }
  checkOwner(event, userId) { if (String(event.userId) !== String(userId)) fail('Нет доступа', 403); }
  async status(id, value) {
    if (!Object.hasOwn(STATUSES, value)) fail('Неизвестный статус');
    const { data, event } = await this.get(id);
    if ((event.status || 'filled') !== value) {
      event.status = value; event.statusAt = Date.now();
      event.statusHistory ||= [];
      event.statusHistory.push({ status: value, at: event.statusAt });
      await this.bot.admin.save(data);
    }
    return event;
  }
  async enroll(id) {
    const { data, event } = await this.get(id);
    if (['hold', 'dropped'].includes(event.status)) fail('Сначала верните статус «Заполнил анкету»');
    const course = this.course(event);
    if (!COURSES[course]) fail('Не удалось определить профессию заявки');
    if (!event.training) {
      event.training = { course, assignedAt: Date.now(), nextAt: Date.now(), days: [] };
      await this.bot.admin.save(data);
    }
    return event;
  }
  async tick(now = Date.now()) {
    const { events } = await this.bot.admin.load();
    for (const item of events.filter((e) => e.training)) {
      const { data, event } = await this.get(item.id);
      const t = event.training;
      if (['hold', 'dropped'].includes(event.status) || t.days.length >= 5 || t.nextAt > now) continue;
      const day = t.days.length;
      const lesson = COURSES[t.course][day];
      try {
        await this.bot.sendDocument(event.userId, t.course, day + 1, `🎓 HR PRIME · День ${day + 1}/5\n${lesson.title}\n\n${NOTICE}`, keyboard(
          [button('✅ Ознакомился · пройти тест', `learn:read:${event.id}:${day}`)],
          ...(this.bot.miniAppKeyboard()?.inline_keyboard || []),
        ));
        t.days.push({ sentAt: now, answers: [], attempt: 0 });
        t.nextAt = now + DAY;
        delete t.deliveryError;
      } catch (error) {
        t.deliveryError = `Не доставлен день ${day + 1}: ${error.code || 'network'}`;
        t.nextAt = now + Math.max(60000, (error.retryAfter || 0) * 1000);
      }
      await this.bot.admin.save(data);
    }
  }
  async read(id, day, userId) {
    const { data, event } = await this.get(id); this.checkOwner(event, userId);
    const record = event.training?.days[day];
    if (!record || !Number.isInteger(day)) fail('Урок ещё не открыт');
    record.readAt ||= Date.now();
    await this.bot.admin.save(data);
    return this.viewDay(event, day);
  }
  viewDay(event, day) {
    const record = event.training?.days[day];
    if (!record) fail('Урок ещё не открыт');
    const quiz = QUIZZES[event.training.course][day];
    return { ...record, lesson: COURSES[event.training.course][day],
      questions: record.readAt ? quiz.map(({ text, options }) => ({ text, options })) : [],
      review: record.result ? quiz.map((q) => ({ answer: q.answer, explanation: q.explanation })) : undefined };
  }
  async submit(id, day, userId, answers, attempt) {
    const { data, event } = await this.get(id); this.checkOwner(event, userId);
    const record = event.training?.days[day];
    if (!record?.readAt) fail('Сначала нажмите «Ознакомился»');
    if (record.attempt !== attempt) fail('Попытка устарела. Обновите урок', 409);
    if (record.result) return this.viewDay(event, day);
    const quiz = QUIZZES[event.training.course][day];
    if (!Array.isArray(answers) || answers.length !== quiz.length || answers.some((v) => !Number.isInteger(v) || v < 0 || v > 2)) fail('Ответьте на все вопросы');
    const score = answers.filter((v, i) => v === quiz[i].answer).length;
    record.answers = answers; record.result = { score, total: quiz.length, passed: score >= 2, at: Date.now() };
    record.history ||= []; record.history.push(record.result);
    if (event.training.days.length === 5 && event.training.days.every((d) => d.result?.passed)) event.training.completedAt ||= Date.now();
    await this.bot.admin.save(data);
    await this.bot.admin.record(`test-${event.id}-${day}-${attempt}`, 'training', { id: userId, username: event.username }, `Заявка №${event.id} · День ${day + 1}: ${score}/${quiz.length}${event.training.completedAt ? '\n🎓 Курс завершён' : ''}`);
    return this.viewDay(event, day);
  }
  async retry(id, day, userId) {
    const { data, event } = await this.get(id); this.checkOwner(event, userId);
    const r = event.training?.days[day];
    if (!r?.result || r.result.passed) fail('Повтор доступен после несданного теста');
    delete r.result; r.answers = []; r.attempt++;
    await this.bot.admin.save(data);
    return this.viewDay(event, day);
  }
  async callback(callback) {
    const [, action, id, ds, attempt, qi, option] = callback.data.split(':');
    const day = Number(ds), userId = callback.from.id;
    if (action === 'read') await this.read(id, day, userId);
    else if (action === 'retry') await this.retry(id, day, userId);
    else if (action === 'answer') {
      const { data, event } = await this.get(id); this.checkOwner(event, userId);
      const r = event.training?.days[day];
      if (!r?.readAt || r.result || r.attempt !== Number(attempt) || r.answers.length !== Number(qi)) return;
      if (![0, 1, 2].includes(Number(option))) return;
      r.answers.push(Number(option));
      await this.bot.admin.save(data);
      if (r.answers.length === 3) await this.submit(id, day, userId, r.answers, r.attempt);
    } else return;
    const { event } = await this.get(id); this.checkOwner(event, userId);
    const r = event.training.days[day];
    const questions = QUIZZES[event.training.course][day];
    if (r.result) {
      await this.bot.sendMessage(userId, `День ${day + 1}: ${r.result.score}/3 · ${r.result.passed ? '✅ Зачёт' : 'Нужно 2 из 3'}\n\n${questions.map((q, i) => `${i + 1}. ${q.explanation}`).join('\n\n')}`, r.result.passed ? undefined : keyboard([button('↻ Повторить тест', `learn:retry:${id}:${day}`)]));
    } else {
      const i = r.answers.length;
      await this.bot.sendMessage(userId, `📝 День ${day + 1} · Вопрос ${i + 1}/3\n\n${questions[i].text}`, keyboard(...questions[i].options.map((o, n) => [button(o, `learn:answer:${id}:${day}:${r.attempt}:${i}:${n}`)])));
    }
  }
}
