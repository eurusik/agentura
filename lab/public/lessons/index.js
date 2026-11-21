// Реєстр курсу: які уроки є, у якому порядку і чи вони вже готові.
// Щоб додати урок: створи папку lessons/NN-назва/ (як 01-agent) і познач його тут status: "ready".

export const COURSE = {
  title: "Агентура",
  intro:
    "Збираємо AI-агентів з нуля — від одного виклику моделі до маленької фабрики, де агент сам бере задачу з трекера і доводить до мерджу. Кожен урок — це код, який можна запустити й погортати по кадрах.",
};

export const LESSONS = [
  {
    id: 1,
    folder: "01-agent",
    title: "Як влаштований агент",
    about:
      "Модель, інструменти, інструкція і цикл. Збираємо свого агента руками і бачимо, що всередині Claude Code.",
    status: "ready",
  },
  {
    id: 2,
    folder: "02-tracker",
    title: "Міні-трекер: агент бере задачу",
    about:
      "Свій маленький трекер задач. Агент бачить задачі, бере собі одну і рухає її статус — як агенти беруть задачі з Jira за міткою.",
    status: "soon",
  },
  {
    id: 3,
    folder: "03-git",
    title: "Міні-git: гілка, коміт, MR",
    about: "Агент робить гілку, пише код, комітить і відкриває merge request. Мерджить — людина.",
    status: "soon",
  },
  {
    id: 4,
    folder: "04-rules",
    title: "Правила проєкту",
    about: "CLAUDE.md і скіли: агент робить задачу так, як прийнято саме в цьому проєкті.",
    status: "soon",
  },
  {
    id: 5,
    folder: "05-quality",
    title: "Перевірка якості",
    about: "Тести як CI і агент-рев'юер: поки не «зелено», мерджу немає.",
    status: "soon",
  },
  {
    id: 6,
    folder: "06-search",
    title: "Пошук знань",
    about:
      "Агент шукає в міні-вікі, як у проєкті роблять такі речі, — навіть коли слова не збігаються. Це векторний пошук.",
    status: "soon",
  },
  {
    id: 7,
    folder: "07-graph",
    title: "Граф знань",
    about: "Хто власник модуля, від чого залежить задача — і кому віддати рев'ю.",
    status: "soon",
  },
  {
    id: 8,
    folder: "08-factory",
    title: "Міні-фабрика",
    about:
      "Ти створюєш задачу, а агенти проводять її через план, код, перевірки й рев'ю до merge request. Мерджиш — ти.",
    status: "soon",
  },
];

// Пройдені уроки пам'ятаємо в браузері (localStorage). Якщо він недоступний — просто не пам'ятаємо.
const DONE_KEY = "agent-lab:done";

export function doneLessons() {
  try {
    return new Set(JSON.parse(localStorage.getItem(DONE_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

export function markDone(id) {
  try {
    localStorage.setItem(DONE_KEY, JSON.stringify([...doneLessons().add(id)]));
  } catch {
    // приватне вікно або заблоковане сховище — не страшно
  }
}
