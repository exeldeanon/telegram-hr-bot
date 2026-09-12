import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { VACANCIES } from "./vacancies.js";
import { Admin } from "./admin.js";
import { button, keyboard, questionCard, vacancyLabels } from "./ui.js";

const CALLBACKS = {
  acceptConsent: "consent:accept",
  vacancyPrefix: "vacancy:",
  submitPrefix: "application:submit:",
};

const QUESTIONS = {
  awaiting_name: "Как я могу к вам обращаться?",
  awaiting_phone: "Укажите номер телефона для связи. Например: +7 999 123-45-67",
  awaiting_age: "Укажите ваш возраст (числом).",
  awaiting_experience:
    "Расскажите коротко об опыте работы (в любой сфере). Если опыта нет - напишите «нет».",
  awaiting_location: "Гражданство и город, где вы сейчас находитесь?",
  awaiting_equipment: "Какая у вас техника для работы (ПК/ноутбук/телефон)?",
  awaiting_online_readiness: "Готовы ли вы работать онлайн? (да/нет)",
  awaiting_employment_status:
    "Имеется ли у вас открытая самозанятость или ИП, или в каком статусе вы сейчас? (ИП, самозанятость, ничего)",
};

export class TelegramHrBot {
  constructor(config) {
    this.config = config;
    this.storageDir = path.resolve(config.DATA_DIR || "storage");
    this.admin = new Admin(this);
  }

  async handleUpdate(update) {
    if (update.callback_query) {
      await this.handleCallback(update.callback_query);
      return;
    }

    const message = update.message;
    const chatId = message?.chat?.id;
    const text = String(message?.text ?? "").trim();

    if (!chatId || !text) return;
    if (message.chat.type !== "private" || !message.from) return;
    if (await this.admin.command(message, text)) return;

    if (/^\/(start|restart)(?:\s|$)/.test(text)) {
      const session = `${chatId}-${message.message_id}`;
      await this.admin.record(`visit-${session}`, "visit", message.from);
      await this.saveState(chatId, { step: "awaiting_consent", draft: {}, session });
      await this.sendMessage(chatId, this.welcomeText(), this.consentKeyboard());
      return;
    }

    if (text === "/help") {
      await this.sendMessage(chatId, this.helpText());
      return;
    }

    const state = await this.loadState(chatId);
    const transition = this.advanceDraft(state.step ?? "idle", text, state.draft ?? {});

    if (!transition.ok) {
      await this.sendMessage(chatId, transition.message);
      return;
    }

    await this.saveState(chatId, {
      ...state,
      step: transition.nextStep,
      draft: transition.draft,
    });
    if (state.step === "awaiting_name") {
      await this.admin.record(`started-${state.session || chatId}`, "started", message.from);
    }

    if (transition.nextStep === "awaiting_vacancy") {
      await this.sendMessage(chatId, "HR PRIME · ВЫБОР ПРОФЕССИИ\n\n✨ Приятно познакомиться!\nВыберите направление — покажу задачи и условия. После выбора продолжим анкету.", this.vacancyKeyboard());
      return;
    }
    if (transition.nextStep === "awaiting_submission") {
      if (!VACANCIES[state.vacancyId]) {
        await this.saveState(chatId, { ...state, draft: transition.draft, step: "awaiting_vacancy" });
        await this.sendMessage(chatId, "🧭 Осталось выбрать профессию", this.vacancyKeyboard());
        return;
      }
      await this.sendMessage(chatId, `✅ Анкета заполнена · 8/8\n\nПроверьте данные и подайте заявку.\n\n${this.formatApplication(transition.draft, state.vacancyId)}`, this.submitKeyboard(state.vacancyId));
      return;
    }

    await this.sendMessage(chatId, questionCard(QUESTIONS, transition.nextStep));
  }

  async handleCallback(callback) {
    const callbackId = callback.id;
    const data = String(callback.data ?? "");
    const chatId = callback.message?.chat?.id;

    if (callbackId) {
      await this.telegramRequest("answerCallbackQuery", { callback_query_id: callbackId });
    }

    if (!chatId || callback.message.chat.type !== "private" || !callback.from) return;
    if (data.startsWith("admin:")) {
      const parts = data.split(":");
      const command = parts[1] === "list" ? `/applications ${parts[2] || 1}` : parts[1] === "item" ? `/application ${parts[2]}` : "/admin";
      await this.admin.command({ chat: callback.message.chat, from: callback.from }, command);
      return;
    }
    if (data === "vacancies:back") {
      const state = await this.loadState(chatId);
      if (!["awaiting_submission", "awaiting_vacancy_confirmation"].includes(state.step)) return;
      await this.saveState(chatId, { ...state, step: "awaiting_vacancy" });
      await this.sendMessage(chatId, "🧭 Выберите другое направление", this.vacancyKeyboard());
      return;
    }
    if (data === "application:continue") {
      const state = await this.loadState(chatId);
      if (state.step !== "awaiting_vacancy_confirmation" || !VACANCIES[state.vacancyId]) return;
      const nextStep = this.isCompletedDraft(state.draft) ? "awaiting_submission" : "awaiting_phone";
      await this.saveState(chatId, { ...state, step: nextStep });
      await this.sendMessage(chatId, nextStep === "awaiting_submission"
        ? `✅ Проверьте анкету\n\n${this.formatApplication(state.draft, state.vacancyId)}`
        : questionCard(QUESTIONS, nextStep), nextStep === "awaiting_submission" ? this.submitKeyboard(state.vacancyId) : undefined);
      return;
    }

    if (data === CALLBACKS.acceptConsent) {
      const state = await this.loadState(chatId);
      if (state.step !== "awaiting_consent") return;
      await this.saveState(chatId, { ...state, step: "awaiting_name", draft: {} });
      await this.sendMessage(chatId, questionCard(QUESTIONS, "awaiting_name"));
      return;
    }

    if (data.startsWith(CALLBACKS.vacancyPrefix)) {
      const vacancyId = data.slice(CALLBACKS.vacancyPrefix.length);

      if (!VACANCIES[vacancyId]) {
        await this.sendMessage(chatId, "Вакансия не найдена. Отправьте /restart и попробуйте снова.");
        return;
      }

      const state = await this.loadState(chatId);
      if (state.step !== "awaiting_vacancy") return;
      await this.saveState(chatId, {
        ...state,
        step: "awaiting_vacancy_confirmation",
        draft: state.draft ?? {},
        vacancyId,
      });
      await this.sendMessage(chatId, VACANCIES[vacancyId].description, keyboard(
        [button("✍️ Продолжить анкету →", "application:continue")],
        [button("‹ Другие профессии", "vacancies:back")],
      ));
      return;
    }

    if (data.startsWith(CALLBACKS.submitPrefix)) {
      const vacancyId = data.slice(CALLBACKS.submitPrefix.length);
      const state = await this.loadState(chatId);
      const draft = state.draft ?? {};
      if (state.step === "completed") {
        await this.sendMessage(chatId, "Эта анкета уже подана. Новая анкета: /restart");
        return;
      }

      if (state.step !== "awaiting_submission" || state.vacancyId !== vacancyId || !VACANCIES[vacancyId] || !this.isCompletedDraft(draft)) {
        await this.sendMessage(chatId, "Не хватает данных анкеты. Отправьте /restart и заполните ее заново.");
        return;
      }

      const application = this.formatApplication(draft, vacancyId);
      await this.admin.record(`application-${state.session || chatId}`, "application", callback.from, application);
      const sentToManager = this.admin.id ? true : await this.sendToManager(application).catch(() => false);

      await this.saveState(chatId, {
        ...state,
        step: "completed",
        draft,
        vacancyId,
      });

      if (sentToManager) {
        await this.sendMessage(chatId, `✅ ЗАЯВКА ПРИНЯТА\n\nСпасибо за знакомство! Ваша анкета сохранена для рассмотрения.\n\n${application}`);
        return;
      }

      const username = String(this.config.HR_MANAGER_USERNAME ?? "").replace(/^@/, "");
      const suffix = username ? `\n\nОтправьте ее HR-менеджеру: @${username}` : "";
      await this.sendMessage(
        chatId,
        `Анкета готова, но автоматическая отправка менеджеру не настроена.${suffix}\n\n${application}`,
      );
    }
  }

  advanceDraft(step, input, draft) {
    switch (step) {
      case "awaiting_name":
        return this.validateTextStep(input, draft, "name", "awaiting_vacancy", "имя", 120);
      case "awaiting_phone": {
        const result = this.validatePhone(input);
        return result.ok
          ? { ok: true, draft: { ...draft, phone: result.value }, nextStep: "awaiting_age" }
          : result;
      }
      case "awaiting_age": {
        const result = this.validateAge(input);
        return result.ok
          ? { ok: true, draft: { ...draft, age: result.value }, nextStep: "awaiting_experience" }
          : result;
      }
      case "awaiting_experience":
        return this.validateTextStep(input, draft, "experience", "awaiting_location", "опыт работы или «нет»", 1000);
      case "awaiting_location":
        return this.validateTextStep(input, draft, "citizenshipCity", "awaiting_equipment", "гражданство и город", 300);
      case "awaiting_equipment":
        return this.validateTextStep(input, draft, "equipment", "awaiting_online_readiness", "технику для работы", 500);
      case "awaiting_online_readiness": {
        const result = this.validateOnlineReadiness(input);
        return result.ok
          ? { ok: true, draft: { ...draft, onlineReadiness: result.value }, nextStep: "awaiting_employment_status" }
          : result;
      }
      case "awaiting_employment_status": {
        const result = this.validateEmploymentStatus(input);
        return result.ok
          ? { ok: true, draft: { ...draft, employmentStatus: result.value }, nextStep: "awaiting_submission" }
          : result;
      }
      default:
        return { ok: false, message: "Чтобы начать анкету, отправьте /start." };
    }
  }

  validateTextStep(input, draft, field, nextStep, label, maxLength) {
    const result = this.validateText(input, label, maxLength);
    return result.ok ? { ok: true, draft: { ...draft, [field]: result.value }, nextStep } : result;
  }

  validateText(input, label, maxLength) {
    const value = input.trim();
    if (!value) return { ok: false, message: `⚠️ Укажите ${label}.` };
    if (value.length > maxLength) {
      return { ok: false, message: `⚠️ Ответ слишком длинный. Сократите его до ${maxLength} символов.` };
    }
    return { ok: true, value };
  }

  validatePhone(input) {
    const digits = input.replace(/\D/g, "");
    if (!digits) return { ok: false, message: "⚠️ Укажите номер телефона цифрами." };
    if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) {
      return { ok: true, value: `+7${digits.slice(1)}` };
    }
    if (digits.length === 10 && digits.startsWith("9")) {
      return { ok: true, value: `+7${digits}` };
    }
    return { ok: false, message: "⚠️ Не похоже на номер. Формат: +7XXXXXXXXXX." };
  }

  validateAge(input) {
    const value = input.trim();
    if (!/^\d{1,3}$/.test(value)) {
      return { ok: false, message: "⚠️ Укажите возраст целым числом от 1 до 120." };
    }
    const age = Number(value);
    if (age < 1 || age > 120) {
      return { ok: false, message: "⚠️ Укажите возраст целым числом от 1 до 120." };
    }
    return { ok: true, value: age };
  }

  validateOnlineReadiness(input) {
    const value = input.trim().toLocaleLowerCase("ru-RU");
    if (value === "да") return { ok: true, value: "Да" };
    if (value === "нет") return { ok: true, value: "Нет" };
    return { ok: false, message: "⚠️ Ответьте «да» или «нет»." };
  }

  validateEmploymentStatus(input) {
    const value = input.trim().toLocaleLowerCase("ru-RU");
    if (value === "ип") return { ok: true, value: "ИП" };
    if (["самозанятость", "самозанятый", "самозанятая"].includes(value)) {
      return { ok: true, value: "Самозанятость" };
    }
    if (["ничего", "нет", "не имеется"].includes(value)) {
      return { ok: true, value: "Ничего" };
    }
    return { ok: false, message: "⚠️ Укажите один из вариантов: ИП, самозанятость или ничего." };
  }

  isCompletedDraft(draft) {
    return Boolean(
      draft.name &&
        draft.phone &&
        typeof draft.age === "number" &&
        draft.experience &&
        draft.citizenshipCity &&
        draft.equipment &&
        draft.onlineReadiness &&
        draft.employmentStatus,
    );
  }

  formatApplication(draft, vacancyId) {
    return `📄 Анкета кандидата
Вакансия: ${VACANCIES[vacancyId].title}

Имя: ${draft.name}
Возраст: ${draft.age}
Телефон: ${draft.phone}
Опыт работы: ${draft.experience}
Гражданство / город: ${draft.citizenshipCity}
Техника для работы: ${draft.equipment}
Готовность к онлайн: ${draft.onlineReadiness}
Статус/самозанятость/ИП: ${draft.employmentStatus}

Прошу рассмотреть мою кандидатуру. Спасибо! 🙌`;
  }

  welcomeText() {
    return `HR PRIME · КАРЬЕРА

👋 Давайте найдём ваше направление

Помогу познакомиться с вакансиями и подать заявку HR-менеджеру.

👋 Знакомство и ваше имя
🧭 Выбор направления
✍️ Остальные вопросы анкеты
📨 Подача анкеты

Перед началом ознакомьтесь с документами:
🔗 Политика конфиденциальности: ${this.config.POLICY_URL}
🔗 Согласие на обработку персональных данных: ${this.config.PERSONAL_DATA_URL}

Нажимая «Принимаю · начать», вы соглашаетесь с обоими документами.`;
  }

  helpText() {
    return `🧭 Как подать заявку

Отправьте /start и нажмите «Принимаю · начать». Укажите имя, выберите профессию и ознакомьтесь с условиями. Нажмите «Продолжить анкету», ответьте на оставшиеся 7 вопросов и нажмите «Подать заявку».

/restart — начать анкету заново
/help — показать эту подсказку`;
  }

  consentKeyboard() {
    return keyboard([button("✅ Принимаю · начать →", CALLBACKS.acceptConsent)]);
  }

  vacancyKeyboard() {
    return {
      inline_keyboard: Object.entries(VACANCIES).map(([id, vacancy]) => [
        { text: vacancyLabels[id] || vacancy.title, callback_data: `${CALLBACKS.vacancyPrefix}${id}` },
      ]),
    };
  }

  submitKeyboard(vacancyId) {
    return {
      inline_keyboard: [
        [button("📨 Подать заявку →", `${CALLBACKS.submitPrefix}${vacancyId}`)],
        [button("‹ Другие вакансии", "vacancies:back")],
      ],
    };
  }

  async loadState(chatId) {
    try {
      const state = JSON.parse(await readFile(this.statePath(chatId), "utf8"));
      return state && typeof state === "object" ? state : { step: "idle", draft: {} };
    } catch {
      return { step: "idle", draft: {} };
    }
  }

  async saveState(chatId, state) {
    await mkdir(this.storageDir, { recursive: true });
    await writeFile(this.statePath(chatId), JSON.stringify(state, null, 2), "utf8");
  }

  statePath(chatId) {
    const safeChatId = String(chatId).replace(/[^0-9-]/g, "");
    return path.join(this.storageDir, `chat-${safeChatId}.json`);
  }

  async sendToManager(text) {
    if (!this.config.HR_MANAGER_CHAT_ID) return false;
    return this.sendMessage(this.config.HR_MANAGER_CHAT_ID, text);
  }

  async sendMessage(chatId, text, replyMarkup) {
    if (text.length > 3500) {
      for (let index = 0; index < text.length; index += 3500) {
        await this.sendMessage(chatId, text.slice(index, index + 3500), index + 3500 >= text.length ? replyMarkup : undefined);
      }
      return true;
    }
    const payload = { chat_id: chatId, text };
    if (replyMarkup) payload.reply_markup = replyMarkup;
    return this.telegramRequest("sendMessage", payload);
  }

  async telegramRequest(method, payload, signal) {
    const response = await fetch(`https://api.telegram.org/bot${this.config.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(45000)]) : AbortSignal.timeout(45000),
    });

    const data = await response.json();
    if (!response.ok || !data.ok) {
      const error = new Error(`Telegram API ${method} failed`);
      error.code = data.error_code ?? response.status;
      error.retryAfter = data.parameters?.retry_after;
      throw error;
    }
    return data.result;
  }
}
