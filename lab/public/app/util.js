// Дрібні допоміжні функції, потрібні всім частинам сторінки.

// Екранує текст, щоб його можна було безпечно вставити в HTML
export function esc(value) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
  return String(value ?? "").replace(/[&<>]/g, (ch) => map[ch]);
}

// Обрізає довгий текст і ставить «…» в кінці
export function short(value, max = 140) {
  const text = String(value ?? "");
  return text.length > max ? text.slice(0, max) + "…" : text;
}

// «1 повідомлення», «3 повідомлення», «5 повідомлень»
export function messagesCount(n) {
  const last = n % 10;
  const lastTwo = n % 100;
  const few = last >= 1 && last <= 4 && !(lastTwo >= 11 && lastTwo <= 14);
  return `${n} ${few ? "повідомлення" : "повідомлень"}`;
}

// «1 раз», «2 рази», «5 разів»
export function timesCount(n) {
  const last = n % 10;
  const lastTwo = n % 100;
  if (last === 1 && lastTwo !== 11) return `${n} раз`;
  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return `${n} рази`;
  return `${n} разів`;
}
