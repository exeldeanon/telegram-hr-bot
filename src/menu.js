import { button, keyboard, vacancyLabels } from './ui.js';
import { VACANCIES } from './vacancies.js';

export const WEBSITE = 'https://up-hire.ru';
export const POLICY_URL = `${WEBSITE}/policy`;
export const PERSONAL_DATA_URL = `${WEBSITE}/personal-data`;
export const homeText = `UpHire · работа начинается с диалога

👋 Рады знакомству!

Здесь можно спокойно изучить направления, задать вопрос менеджеру и оставить анкету — всё в одном чате.

Документы:
🔐 <a href="${POLICY_URL}">Политика конфиденциальности</a>
📄 <a href="${PERSONAL_DATA_URL}">Обработка персональных данных</a>

Выберите, с чего начнём ↓`;
export const homeKeyboard = () => keyboard(
  [button('💼 Посмотреть вакансии', 'menu:vacancies')],
  [button('🌿 О нас', 'menu:about'), button('❔ Ответы на вопросы', 'menu:faq')],
  [button('💬 Связь с менеджером', 'menu:manager'), { text: '↗ Наш сайт', url: WEBSITE }],
  [button('✍️ Моя анкета', 'menu:application'), button('🎓 Моё обучение', 'menu:training')],
);
export const backHome = () => button('‹ Главное меню', 'menu:home');
export const infoKeyboard = () => keyboard([button('💼 Выбрать вакансию', 'menu:vacancies')], [backHome()]);
export const catalogKeyboard = () => keyboard(...Object.entries(VACANCIES).map(([id, vacancy]) => [button(vacancyLabels[id] || vacancy.title, `menu:job:${id}`)]), [backHome()]);
export const infoPages = {
  about: '🌿 UpHire · знакомимся ближе\n\nМы помогаем кандидатам познакомиться с направлениями удалённой работы и пройти первые шаги: от выбора вакансии до общения с менеджером и обучения.\n\nВ нашем боте — поддержка в чате, звонки, страхование и партнёрский маркетинг. Выбирайте то, что ближе вашим навыкам и интересам.\n\nУсловия конкретного проекта, график, оформление и вознаграждение уточняет менеджер. Анкета — начало знакомства, а не обещание трудоустройства.',
};

export function answersText(managerUsername) {
  const username = String(managerUsername || '').replace(/^@/, '');
  const manager = /^[A-Za-z0-9_]{5,32}$/.test(username)
    ? `<a href="https://t.me/${username}">@${username}</a>`
    : 'через кнопку «Связь с менеджером»';
  return `❔ Ответы на вопросы

Как подать заявку?
Выберите вакансию, изучите условия и заполните короткую анкету. После отправки менеджер свяжется с вами и расскажет о следующих шагах.

Нужен ли опыт?
Зависит от направления. Часто важнее внимательность, умение общаться и готовность учиться.

Можно работать удалённо?
Да, в каталоге представлены удалённые направления. Требования к технике и графику указаны в вакансии.

Можно ли сменить выбранную вакансию?
Самостоятельно сменить направление после выбора нельзя. Для изменения вакансии обратитесь к менеджеру.

Сколько можно заработать?
Оплата зависит от проекта, задач и результата. Точные условия менеджер уточнит до старта.

Где находится обучение?
После назначения оно появится в разделе «Моё обучение». Там можно продолжить тест или повторно получить материал.

Не нашли ответ? Напишите менеджеру: ${manager}`;
}

// Navigation never changes an application draft. Mutating actions live in bot.js.
export async function handleMenu(bot, callback) {
  const data = callback.data;
  if (!data.startsWith('menu:')) return false;
  const chatId = callback.message.chat.id;
  const page = data.slice(5);
  if (page === 'home') await bot.showBanner(callback, 'home', homeText, homeKeyboard());
  else if (page === 'vacancies') await bot.showBanner(callback, 'vacancies', '💼 Найдите своё направление\n\nЛюбите переписку, живое общение или работу с партнёрами? Откройте карточку, чтобы посмотреть задачи и условия.\n\nАнкета откроется только из карточки выбранной вакансии.', catalogKeyboard());
  else if (page === 'how' || page === 'faq') await bot.showBanner(callback, 'faq', answersText(bot.config.HR_MANAGER_USERNAME), keyboard([button('💬 Связаться с менеджером', 'menu:manager')], [button('💼 Посмотреть вакансии', 'menu:vacancies')], [backHome()]));
  else if (Object.hasOwn(infoPages, page)) await bot.showBanner(callback, page, infoPages[page], infoKeyboard());
  else if (page.startsWith('job:')) {
    const id = page.slice(4);
    if (Object.hasOwn(VACANCIES, id)) await bot.showBanner(callback, 'vacancies', VACANCIES[id].description, keyboard([button('✍️ Откликнуться на вакансию', `menu:apply:${id}`)], [button('‹ Все вакансии', 'menu:vacancies'), backHome()]));
    else await bot.showBanner(callback, 'vacancies', 'Этого направления нет в каталоге. Выберите актуальную вакансию.', catalogKeyboard());
  } else if (page === 'manager') {
    const username = String(bot.config.HR_MANAGER_USERNAME || '').replace(/^@/, '');
    const valid = /^[A-Za-z0-9_]{5,32}$/.test(username);
    await bot.showBanner(callback, 'manager', `💬 Давайте обсудим ваш вопрос\n\nПо выбору вакансии, условиям и анкете можно написать менеджеру.${valid ? '\n\nПредставьтесь и укажите интересующее направление — так будет проще помочь.' : '\n\nПрямой контакт пока не указан. Выберите вакансию или проверьте контакты на нашем сайте.'}`,
      keyboard(...(valid ? [[{ text: '💬 Написать менеджеру', url: `https://t.me/${username}` }]] : [[{ text: '↗ Контакты на сайте', url: WEBSITE }]]), [button('✍️ Моя анкета', 'menu:application'), backHome()]));
  } else if (page === 'training') {
    const dashboard = await bot.training.dashboard(callback.from.id);
    await bot.showBanner(callback, 'training', dashboard.text, dashboard.markup);
  }
  else if (page === 'application') await bot.resumeApplication(chatId, callback);
  else if (page === 'apply') await bot.showBanner(callback, 'vacancies', '💼 Сначала выберите вакансию\n\nАнкета привязывается к конкретному направлению. Откройте карточку, изучите условия и нажмите «Откликнуться».', catalogKeyboard());
  else if (page.startsWith('apply:')) await bot.beginApplication(callback, page.slice(6));
  else if (page === 'restart' || page.startsWith('replace:')) await bot.showBanner(callback, 'application', '🔒 Смена направления\n\nИзменить выбранную вакансию можно только через менеджера — так мы не потеряем вашу анкету и историю рассмотрения.', keyboard([button('💬 Связаться с менеджером', 'menu:manager')], [button('✍️ Моя анкета', 'menu:application'), backHome()]));
  else await bot.showBanner(callback, 'home', homeText, homeKeyboard());
  return true;
}
