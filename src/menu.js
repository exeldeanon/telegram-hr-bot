import { button, keyboard, vacancyLabels } from './ui.js';
import { VACANCIES } from './vacancies.js';

export const WEBSITE = 'https://up-hire.ru';
export const POLICY_URL = `${WEBSITE}/policy`;
export const PERSONAL_DATA_URL = `${WEBSITE}/personal-data`;
export const homeText = 'UpHire · работа начинается с диалога\n\n👋 Рады знакомству!\n\nЗдесь можно спокойно изучить направления, задать вопрос менеджеру и оставить анкету — всё в одном чате.\n\nВыберите, с чего начнём ↓';
export const homeKeyboard = () => keyboard(
  [button('💼 Посмотреть вакансии', 'menu:vacancies')],
  [button('🌿 О нас', 'menu:about'), button('🧭 Как всё устроено', 'menu:how')],
  [button('💬 Связь с менеджером', 'menu:manager'), { text: '↗ Наш сайт', url: WEBSITE }],
  [button('✍️ Моя анкета', 'menu:application'), button('❔ Частые вопросы', 'menu:faq')],
  [button('🎓 Моё обучение', 'menu:training')],
  [{ text: '🔐 Конфиденциальность', url: POLICY_URL }, { text: '📄 Персональные данные', url: PERSONAL_DATA_URL }],
);
export const backHome = () => button('‹ Главное меню', 'menu:home');
export const infoKeyboard = () => keyboard([button('💼 Выбрать вакансию', 'menu:vacancies')], [backHome()]);
export const catalogKeyboard = () => keyboard(...Object.entries(VACANCIES).map(([id, vacancy]) => [button(vacancyLabels[id] || vacancy.title, `menu:job:${id}`)]), [backHome()]);
export const replacementCatalogKeyboard = () => keyboard(...Object.entries(VACANCIES).map(([id, vacancy]) => [button(vacancyLabels[id] || vacancy.title, `menu:replace:${id}`)]), [button('Нет, вернуться к анкете', 'menu:application'), backHome()]);
export const infoPages = {
  about: '🌿 UpHire · знакомимся ближе\n\nМы помогаем кандидатам познакомиться с направлениями удалённой работы и пройти первые шаги: от выбора вакансии до общения с менеджером и обучения.\n\nВ нашем боте — поддержка в чате, звонки, страхование и партнёрский маркетинг. Выбирайте то, что ближе вашим навыкам и интересам.\n\nУсловия конкретного проекта, график, оформление и вознаграждение уточняет менеджер. Анкета — начало знакомства, а не обещание трудоустройства.',
  how: '🧭 Ваш путь в UpHire\n\n1 · Выберите направление\nИзучите задачи и условия в разделе «Вакансии».\n\n2 · Расскажите о себе\nПосле ознакомления с документами заполните короткую анкету. Её можно продолжить позже — ответы сохраняются.\n\n3 · Дождитесь рассмотрения\nМенеджер изучит заявку и обсудит следующие шаги.\n\n4 · Подготовьтесь к старту\nЕсли вам назначат обучение, материалы и тесты появятся в этом чате.\n\nЕсть вопрос на любом этапе? Кнопка связи с менеджером — в главном меню.',
  faq: '❔ Коротко о важном\n\nНужен ли опыт?\nЗависит от направления. Для части задач важнее внимательность, общение и готовность учиться.\n\nМожно работать удалённо?\nВ каталоге представлены удалённые направления. Технику, график и требования уточняйте по выбранной вакансии.\n\nСколько можно заработать?\nОплата зависит от проекта, задач и результата. Конкретные условия обсудите с менеджером до старта.\n\nКак вернуться к анкете?\nОткройте /menu → «Моя анкета». Обычный /start не удаляет ответы.\n\nГде обучение?\nВ этом чате после назначения менеджером. Раздел «Моё обучение» поможет сориентироваться.',
};

// Navigation never changes an application draft. Mutating actions live in bot.js.
export async function handleMenu(bot, callback) {
  const data = callback.data;
  if (!data.startsWith('menu:')) return false;
  const chatId = callback.message.chat.id;
  const page = data.slice(5);
  if (page === 'home') await bot.showBanner(callback, 'home', homeText, homeKeyboard());
  else if (page === 'vacancies') await bot.showBanner(callback, 'vacancies', '💼 Найдите своё направление\n\nЛюбите переписку, живое общение или работу с партнёрами? Откройте карточку, чтобы посмотреть задачи и условия.\n\nАнкета откроется только из карточки выбранной вакансии.', catalogKeyboard());
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
  else if (page === 'restart') await bot.showBanner(callback, 'vacancies', '💼 Выберите вакансию для новой анкеты\n\nНезавершённый черновик будет заменён только после вашего выбора. Уже отправленные заявки останутся в CRM.', replacementCatalogKeyboard());
  else if (page.startsWith('replace:')) await bot.beginApplication(callback, page.slice(8), true);
  else await bot.showBanner(callback, 'home', homeText, homeKeyboard());
  return true;
}
