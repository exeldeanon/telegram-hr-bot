export const button = (text, callback_data) => ({ text, callback_data });
export const keyboard = (...rows) => ({ inline_keyboard: rows });
export const adminMenu = () => keyboard(
  [button("📊 Обновить статистику", "admin:stats")],
  [button("📂 Все заявки", "admin:list:1")],
);
export const vacancyLabels = {
  chat_operator: "💬 Оператор чата",
  insurance_agent: "🛡 Страховой агент",
  call_center_operator: "🎧 Оператор колл-центра",
  affiliate_manager: "🤝 Affiliate-менеджер",
};
export function questionCard(questions, step) {
  const index = Object.keys(questions).indexOf(step);
  if (index < 0) return "Чтобы начать анкету, отправьте /start.";
  return `UpHire · ЗНАКОМСТВО\n${"●".repeat(index)}${"○".repeat(8 - index)}  ${index + 1}/8\n\n${questions[step]}\n\nОтветьте сообщением ниже.`;
}
