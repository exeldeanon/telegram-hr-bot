const tg = window.Telegram?.WebApp;
tg?.ready(); tg?.expand();
const screen = document.querySelector('#screen');
const errorBox = document.querySelector('#error');
let model;
const node = (tag, text, cls) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (cls) el.className = cls; return el; };
const append = (parent, ...children) => { parent.append(...children.filter(Boolean)); return parent; };
const btn = (text, fn, cls) => { const b = node('button', text, cls); b.onclick = async () => { b.disabled = true; errorBox.hidden = true; try { await fn(); } catch (e) { showError(e); } finally { b.disabled = false; } }; return b; };
function showError(error) { errorBox.textContent = error.message; errorBox.hidden = false; errorBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
async function api(path, input) {
  const response = await fetch('/api/' + path, { method: input ? 'POST' : 'GET', headers: { 'x-telegram-init-data': tg?.initData || '', ...(input ? { 'content-type': 'application/json' } : {}) }, body: input ? JSON.stringify(input) : undefined });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Ошибка соединения');
  return data;
}
const age = (at) => { const hours = Math.max(0, Math.floor((Date.now() - new Date(at)) / 3600000)); return `${Math.floor(hours / 24)} д. ${hours % 24} ч.`; };
const status = (e) => node('span', model.statuses[e.status || 'filled'], `badge ${e.status || 'filled'}`);
function hero(title, subtitle) {
  const box = node('section', undefined, 'hero');
  return append(box, node('div', 'UpHire / ' + (model.admin ? 'PEOPLE' : 'ACADEMY'), 'eyebrow'), node('h1', title), node('p', subtitle), node('div', '✳', 'orb'));
}
function stats() {
  const box = node('div', undefined, 'stats');
  const values = [[model.applications.length, 'Заявок'], [model.applications.filter((e) => e.training).length, 'На обучении'], [model.applications.filter((e) => e.training?.completedAt).length, 'Завершили']];
  values.forEach(([v, label]) => box.append(append(node('div', undefined, 'stat'), node('strong', String(v)), node('span', label))));
  return box;
}
function identity(e) {
  const row = node('div', undefined, 'row');
  const label = e.username ? '@' + e.username : `ID ${e.userId} · без username`;
  const user = e.username ? node('a', label) : node('span', label, 'meta');
  if (e.username) { user.href = 'https://t.me/' + encodeURIComponent(e.username); user.target = '_blank'; user.rel = 'noopener noreferrer'; }
  return append(row, user, status(e));
}
function trainingSummary(e) {
  const t = e.training;
  if (!t) return node('p', 'Обучение пока не назначено');
  const passed = t.days.filter((d) => d.result?.passed).length;
  const p = node('div');
  const bar = node('div', undefined, 'progress');
  // CSS width via DOM style is permitted without inserting markup from users.
  const fill = node('i'); fill.style.width = `${passed * 20}%`; bar.append(fill);
  append(p, node('p', `${model.vacancies[t.course]} · ${passed}/5 зачтено`), bar);
  if (t.deliveryError) p.append(node('p', t.deliveryError));
  if (['hold', 'dropped'].includes(e.status)) p.append(node('p', 'Выдача новых уроков приостановлена'));
  else if (t.days.length < 5) p.append(node('p', `Следующий материал: ${new Date(t.nextAt).toLocaleString('ru-RU')}`));
  else if (t.completedAt) p.append(node('p', '🎓 Все тесты пройдены. Курс завершён!'));
  return p;
}
function home() {
  screen.replaceChildren(hero(model.admin ? 'Люди. Прогресс.\nРезультат.' : `Ваш новый\nэтап начинается здесь.`, model.admin ? 'Управляйте заявками и помогайте кандидатам расти.' : 'Один урок в день — ещё один шаг к профессии.'));
  if (model.admin) screen.append(stats());
  const toolbar = node('div', undefined, 'toolbar');
  const search = node('input'); search.placeholder = 'Имя, username или номер заявки'; search.setAttribute('aria-label', 'Поиск заявок');
  const filter = node('select'); filter.setAttribute('aria-label', 'Статус заявки');
  const all = node('option', 'Все статусы'); all.value = ''; filter.append(all);
  Object.entries(model.statuses).forEach(([k, v]) => { const o = node('option', v); o.value = k; filter.append(o); });
  const list = node('div');
  if (model.admin) screen.append(append(toolbar, search, filter));
  screen.append(list);
  const render = () => {
    list.replaceChildren();
    const items = model.applications.slice().reverse().filter((e) => (!filter.value || (e.status || 'filled') === filter.value) && `${e.id} ${e.username} ${e.text}`.toLowerCase().includes(search.value.toLowerCase()));
    if (!items.length) list.append(append(node('section', undefined, 'panel empty'), node('b', '✧'), node('h2', 'Здесь пока тихо'), node('p', model.admin ? 'Новые заявки появятся после заполнения анкеты.' : 'После рассмотрения заявки менеджер назначит вам курс.')));
    items.forEach((e) => {
      const card = node('section', undefined, 'lead');
      append(card, node('h3', `Заявка №${e.id}`), identity(e), node('p', `Подана ${age(e.at)} назад${e.status === 'hold' ? ' · В холде ' + age(e.statusAt || e.at) : ''}`), trainingSummary(e), btn(model.admin ? 'Открыть карточку ↗' : 'Мои уроки →', () => detail(e.id)));
      list.append(card);
    });
  };
  search.oninput = render; filter.onchange = render; render();
}
async function reload() { model = await api('me'); home(); }
async function detail(id) {
  const e = model.applications.find((x) => x.id === id);
  screen.replaceChildren(btn('‹ Назад', async () => { await reload(); }, 'secondary'));
  const card = node('section', undefined, 'panel');
  append(card, node('h2', `Заявка №${id}`), identity(e), node('p', `Возраст заявки: ${age(e.at)}${e.status === 'hold' ? ' · В холде: ' + age(e.statusAt || e.at) : ''}`));
  if (model.admin) {
    const actions = node('div', undefined, 'actions');
    const select = node('select'); select.setAttribute('aria-label', 'Изменить статус');
    Object.entries(model.statuses).forEach(([k, v]) => { const o = node('option', v); o.value = k; o.selected = k === (e.status || 'filled'); select.append(o); });
    append(actions, select, btn('Сохранить статус', async () => { await api('action', { action: 'status', id, status: select.value }); model = await api('me'); await detail(id); }));
    card.append(actions);
    if (!e.training) card.append(btn('🎓 Отправить на обучение', async () => { await api('action', { action: 'enroll', id }); model = await api('me'); await detail(id); }, 'wide'));
  }
  append(card, trainingSummary(e), node('pre', e.text)); screen.append(card);
  if (e.training) for (let day = 0; day < 5; day++) {
    const d = e.training.days[day];
    const box = node('section', undefined, 'lesson');
    append(box, node('h3', `День ${day + 1}`), node('p', d ? d.result ? `${d.result.passed ? '✅ Зачтено' : '↻ Нужна повторная попытка'} · ${d.result.score}/3 · попыток: ${d.history?.length || 1}` : d.readAt ? 'Тест ожидает ответа' : 'Материал доступен' : '🔒 Откроется по расписанию'));
    if (d) box.append(btn('Открыть урок →', () => lesson(id, day), 'secondary'));
    screen.append(box);
  }
}
async function lesson(id, day) {
  const data = await api(`lesson?id=${id}&day=${day}`);
  screen.replaceChildren(btn('‹ К курсу', () => detail(id), 'secondary'));
  const box = node('section', undefined, 'panel');
  append(box, node('div', `ДЕНЬ ${day + 1} / 5`, 'eyebrow'), node('h2', data.lesson.title), node('p', model.notice, 'notice'), node('div', data.lesson.text, 'material'));
  screen.append(box);
  if (model.admin) { box.append(node('p', 'Просмотр администратора. Тест проходит кандидат.')); return; }
  if (!data.readAt) { box.append(btn('✓ Ознакомился · перейти к тесту', async () => { await api('action', { action: 'read', id, day }); await lesson(id, day); }, 'wide')); return; }
  if (data.result) {
    const result = node('section', undefined, 'panel');
    append(result, node('h2', `${data.result.passed ? 'Отличная работа!' : 'Попробуем ещё раз'} · ${data.result.score}/3`));
    data.review.forEach((r, i) => result.append(node('p', `${i + 1}. ${data.questions[i].options[r.answer]} — ${r.explanation}`)));
    if (!data.result.passed) result.append(btn('↻ Повторить тест', async () => { await api('action', { action: 'retry', id, day }); await lesson(id, day); }));
    screen.append(result); return;
  }
  const form = node('form', undefined, 'panel');
  append(form, node('h2', 'Проверим знания'), node('p', '3 вопроса · для зачёта нужно 2 правильных ответа'));
  data.questions.forEach((q, i) => {
    const field = node('fieldset', undefined, 'question'); field.append(node('legend', `${i + 1}. ${q.text}`));
    q.options.forEach((o, n) => { const label = node('label', undefined, 'option'); const input = node('input'); input.type = 'radio'; input.name = `q${i}`; input.value = n; input.required = true; append(label, input, node('span', o)); field.append(label); });
    form.append(field);
  });
  const submit = node('button', 'Завершить тест →', 'wide'); submit.type = 'submit'; form.append(submit);
  form.onsubmit = async (event) => { event.preventDefault(); submit.disabled = true; try { const f = new FormData(form); await api('action', { action: 'submit', id, day, attempt: data.attempt, answers: data.questions.map((_, i) => Number(f.get(`q${i}`))) }); model = await api('me'); await lesson(id, day); } catch (e) { showError(e); } finally { submit.disabled = false; } };
  screen.append(form);
}
document.querySelector('#refresh').onclick = () => reload().catch(showError);
if (tg?.initData) reload().catch(showError);
else document.querySelector('#loading').textContent = 'Откройте этот кабинет кнопкой «Открыть UpHire» в Telegram-боте. Здесь появятся ваши заявки и обучение.';
