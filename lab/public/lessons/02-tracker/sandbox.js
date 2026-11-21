// Пісочниця уроку 2: файли робочої папки + маленький трекер задач.
// Трекером можна користуватись двома способами:
//   - код звертається до нього напряму через глобальний об'єкт tracker (без моделі);
//   - модель просить інструменти list_tasks, get_task, update_task, add_comment.
// Сам трекер спільний для уроків (runtime/tracker.js), тут лише задачі на старті і заготовка моделі.
// Цей модуль імпортують і worker (щоб запускати код), і сторінка (щоб описувати прохання людською мовою).
import { createFileTools, describeFileRequest } from "../../runtime/file-tools.js";
import {
  createTracker,
  createTrackerGlobal,
  createTrackerTools,
  describeTrackerRequest,
} from "../../runtime/tracker.js";

// ---------- файли на старті (шляхи відносно /work)
export const FILES = {
  "README.md": "# Мій проєкт\nПісочниця для уроку.\n",
  "notes/todo.md": "- полагодити форму входу\n- оновити залежності\n",
};

// ---------- задачі на старті
const START_TASKS = [
  {
    id: "T-1",
    title: "Додати пункт у список справ",
    description: "Додай у файл notes/todo.md новий пункт «оновити README». Інші пункти не чіпай.",
    labels: ["agent"],
    status: "todo",
  },
  {
    id: "T-2",
    title: "Полагодити форму входу",
    description: "Кнопка «Увійти» не реагує на Enter.",
    labels: [],
    status: "in_progress",
    assignee: "Олена",
  },
  {
    id: "T-3",
    title: "Нотатки до релізу",
    description: "Створи файл notes/release.md з одним рядком: «Версія 1.1: виправлено форму входу».",
    labels: ["agent"],
    status: "todo",
  },
  {
    id: "T-4",
    title: "Зробити сторінку кращою",
    description: "Зроби, щоб було красиво.",
    labels: ["agent"],
    status: "todo",
  },
];

// ---------- що дає лабораторія кодові: об'єкт tracker
const STORE = Symbol("store");

export function createGlobals(workspace, report) {
  const store = createTracker(START_TASKS, report);
  store.reportBoard(null);
  return { tracker: createTrackerGlobal(store, report), [STORE]: store };
}

// ---------- інструменти для моделі: файли + трекер
export function createTools(workspace, report, globals) {
  return { ...createFileTools(workspace, report), ...createTrackerTools(globals[STORE], report) };
}

// ---------- як прохання моделі звучить людською мовою (для кадрів блоку «Що сталося»)
export function describeRequest(name, input = {}, esc) {
  return describeTrackerRequest(name, input, esc) ?? describeFileRequest(name, input, esc);
}

// ---------- заготовка моделі
// Це СЦЕНАРІЙ, а не модель. Дивиться на питання, інструкцію (system), доступні інструменти
// і на те, що вже просила раніше, — і робить наступний крок за планом.
//   «Які задачі чекають?» + list_tasks → дивиться список → відповідає
//   задача T-1 → читає todo.md → дописує пункт → звітує
//   задача T-3 → створює release.md → звітує
//   задача T-4 (розмита) → без інструкції «не вгадуй» вигадує page.html;
//                          з нею — питає в коментарі і повертає задачу в todo
//   «звітує» = коментар і статус review, якщо є такі інструменти; інакше просто текст
let nextId = 0;
const ask = (name, input) => ({
  content: [{ type: "tool_use", id: `toolu_${++nextId}`, name, input }],
  stop_reason: "tool_use",
});
const answer = (text) => ({ content: [{ type: "text", text }], stop_reason: "end_turn" });

export function stubModel({ system = "", messages, tools: toolList }) {
  const has = (name) => (toolList ?? []).some((tool) => tool.name === name);
  const question = typeof messages[0]?.content === "string" ? messages[0].content : "";
  const asked = messages
    .filter((m) => m.role === "assistant" && Array.isArray(m.content))
    .flatMap((m) => m.content.filter((part) => part.type === "tool_use"));
  const didAsk = (name, check = () => true) => asked.some((r) => r.name === name && check(r.input ?? {}));
  const results = messages
    .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
    .filter((part) => part.type === "tool_result");

  const taskId = question.match(/T-\d+/)?.[0];

  // Питання про трекер загалом
  if (!taskId) {
    if (has("list_tasks") && !didAsk("list_tasks")) return ask("list_tasks", { label: "agent" });
    const list = String(results.at(-1)?.content ?? "");
    const ids = list.match(/T-\d+/g) ?? [];
    return answer(
      ids.length
        ? `На агента чекають ${ids.length} задачі: ${ids.join(", ")}. Найпростіша — ${ids[0]}.`
        : "Я не бачу трекера: у мене немає інструментів для нього.",
    );
  }

  // Звіт після роботи: коментар і статус review — якщо є чим
  const report = (whatDone) => {
    if (has("add_comment") && !didAsk("add_comment"))
      return ask("add_comment", { id: taskId, text: `Готово: ${whatDone}` });
    if (has("update_task") && !didAsk("update_task"))
      return ask("update_task", { id: taskId, status: "review" });
    return answer(`Зробив задачу ${taskId}: ${whatDone}`);
  };

  if (taskId === "T-1") {
    if (!didAsk("read_file")) return ask("read_file", { path: "notes/todo.md" });
    if (!didAsk("write_file")) {
      const current = String(results.find((r) => String(r.content).includes("полагодити"))?.content ?? "");
      return ask("write_file", { path: "notes/todo.md", contents: current + "- оновити README\n" });
    }
    return report("додав у notes/todo.md пункт «оновити README»");
  }

  if (taskId === "T-3") {
    if (!didAsk("write_file")) {
      return ask("write_file", {
        path: "notes/release.md",
        contents: "Версія 1.1: виправлено форму входу\n",
      });
    }
    return report("створив notes/release.md");
  }

  if (taskId === "T-4") {
    // Розмита — тільки поки в описі «красиво»; якщо учень переписав опис конкретно, просто робимо
    const vague = /красиво/i.test(question);
    const toldToAsk = /незрозум|не вгадуй|питання/i.test(system);
    if (vague && toldToAsk && has("add_comment")) {
      if (!didAsk("add_comment")) {
        return ask("add_comment", {
          id: "T-4",
          text: "Не зрозумів, що саме зробити: яку сторінку мати на увазі і що для вас «красиво»? Дайте, будь ласка, приклад або макет.",
        });
      }
      if (has("update_task") && !didAsk("update_task"))
        return ask("update_task", { id: "T-4", status: "todo" });
      return answer(
        "Задача T-4 незрозуміла. Я поставив питання в коментарі і повернув її в «Треба зробити».",
      );
    }
    if (!didAsk("write_file"))
      return ask("write_file", { path: "page.html", contents: "<h1>Красиво!</h1>\n" });
    return report("зробив красиво: створив page.html з великим заголовком");
  }

  return answer(`Не знаю, як підступитись до задачі ${taskId}.`);
}
