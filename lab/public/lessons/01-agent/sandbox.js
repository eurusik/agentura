// Пісочниця уроку 1: які файли лежать у робочій папці, які інструменти є в агента
// і як поводиться заготовка моделі в кожному сценарії кроку.
// Цей модуль імпортують і worker (щоб запускати код), і сторінка (щоб описувати прохання людською мовою).

// ---------- файли на старті (шляхи відносно /work)
export const FILES = {
  "README.md": "# Мій проєкт\nПісочниця для уроку.\n",
  "notes/todo.md": "- полагодити форму входу\n- оновити залежності\n- написати тести для кошика\n",
};

// ---------- інструменти: файли робочої папки (спільні для уроків, див. runtime/file-tools.js)
// Перевірок шляху там навмисно НЕМАЄ: у кроці 8 учень дописує їх сам.
export {
  createFileTools as createTools,
  describeFileRequest as describeRequest,
} from "../../runtime/file-tools.js";

// ---------- заготовка моделі
// Це СЦЕНАРІЙ, а не модель: дивиться, які інструменти їй дали і скільки результатів уже прийшло,
// і відповідає за планом. Просить тільки ті інструменти, які є в списку (як і чемна справжня модель).
//   normal  — список файлів → читає todo.md → відповідає
//   no-instructions — без інструкції (system) не розуміє, де шукати, і перепитує (крок 6)
//   runaway — заплуталась і без кінця просить список файлів (крок 7)
//   escape  — просить записати файл за межами робочої папки (крок 8)
//   broken-tool — просить файл, якого немає; після помилки шукає схожий (крок 9)
let nextId = 0;
const askTool = (name, input) => ({
  content: [{ type: "tool_use", id: `toolu_${++nextId}`, name, input }],
  stop_reason: "tool_use",
});
const answer = (text) => ({ content: [{ type: "text", text }], stop_reason: "end_turn" });

export function stubModel({ system, messages, tools: toolList }, scenario) {
  const has = (name) => (toolList ?? []).some((tool) => tool.name === name);
  const results = messages
    .flatMap((message) => (Array.isArray(message.content) ? message.content : []))
    .filter((part) => part.type === "tool_result");

  if (!toolList?.length) {
    return answer("Я не бачу твоїх файлів: у мене немає жодного інструмента, я вмію лише повертати текст.");
  }
  if (scenario === "no-instructions" && !system) {
    return answer("Щоб відповісти, мені треба знати, де записані твої задачі. Підкажи, де їх шукати?");
  }
  if (scenario === "broken-tool") return brokenTool(results);
  if (scenario === "runaway") return askTool("list_files", { dir: "." });
  if (scenario === "escape" && has("write_file")) {
    if (results.length === 0) return askTool("write_file", { path: "../../outside.txt", contents: "hello" });
    return answer(
      results[0]?.is_error ? "Мені відмовили записати файл туди. Добре, не буду." : "Готово, файл записано.",
    );
  }
  if (results.length === 0 && has("list_files")) return askTool("list_files", { dir: "." });
  if (results.length <= 1 && has("read_file")) return askTool("read_file", { path: "notes/todo.md" });

  const sawTodo = results.some((result) => String(result.content).includes("полагодити"));
  return answer(
    sawTodo
      ? "У списку 3 задачі; найважливіша — «полагодити форму входу»."
      : "Я так і не побачив вмісту файлу, тож не можу відповісти.",
  );
}

// Крок 9: просить неіснуючий notes/todo.txt. Якщо отримала помилку як результат —
// дивиться список файлів, знаходить notes/todo.md і читає його.
function brokenTool(results) {
  const last = results[results.length - 1];
  const sawList = results.some((result) => String(result.content).includes("notes/todo.md"));
  const sawTodo = results.some((result) => String(result.content).includes("полагодити"));
  if (results.length === 0) return askTool("read_file", { path: "notes/todo.txt" });
  if (sawTodo)
    return answer(
      "Файлу todo.txt немає, але є notes/todo.md. У ньому 3 задачі; найважливіша — «полагодити форму входу».",
    );
  if (sawList) return askTool("read_file", { path: "notes/todo.md" });
  if (last?.is_error) return askTool("list_files", { dir: "." });
  return answer("Не вийшло прочитати файл.");
}
