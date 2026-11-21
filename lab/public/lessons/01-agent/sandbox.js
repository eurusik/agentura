// Пісочниця уроку 1: які файли лежать у робочій папці, які інструменти є в агента
// і як поводиться заготовка моделі в кожному сценарії кроку.
// Цей модуль імпортують і worker (щоб запускати код), і сторінка (щоб описувати прохання людською мовою).

// ---------- файли на старті (шляхи відносно /work)
export const FILES = {
  "README.md": "# Мій проєкт\nПісочниця для уроку.\n",
  "notes/todo.md": "- полагодити форму входу\n- оновити залежності\n- написати тести для кошика\n",
};

// ---------- інструменти
// У кожної: def — опис для моделі, run — що справді робить.
// Перевірок шляху тут навмисно НЕМАЄ: у кроці 8 учень дописує їх сам.
const stringParam = { type: "string" };

export function createTools(workspace, report) {
  return {
    list_files: {
      // Як Glob у Claude Code: усі файли з підпапками і повними шляхами.
      // Маленькі моделі самі в підпапки не зазирають.
      def: {
        name: "list_files",
        description:
          "List all files in a workspace folder, including subfolders, with their paths. Use '.' for the whole workspace.",
        input_schema: { type: "object", properties: { dir: stringParam }, required: ["dir"] },
      },
      run: async ({ dir }) => {
        const folder = workspace.resolve(dir);
        const output = workspace.list(folder).join("\n") || "(порожньо)";
        report({
          type: "tool",
          name: "list_files",
          input: { dir },
          output,
          ok: true,
          escaped: !workspace.isInside(folder),
        });
        return output;
      },
    },

    read_file: {
      def: {
        name: "read_file",
        description: "Read a text file from the workspace.",
        input_schema: { type: "object", properties: { path: stringParam }, required: ["path"] },
      },
      run: async ({ path }) => {
        const fullPath = workspace.resolve(path);
        if (!workspace.has(fullPath)) {
          const output = `файл не знайдено: ${path}`;
          report({ type: "tool", name: "read_file", input: { path }, output, ok: false });
          throw new Error(output);
        }
        const output = workspace.read(fullPath);
        report({
          type: "tool",
          name: "read_file",
          input: { path },
          output,
          ok: true,
          escaped: !workspace.isInside(fullPath),
        });
        return output;
      },
    },

    write_file: {
      def: {
        name: "write_file",
        description: "Create or overwrite a text file in the workspace.",
        input_schema: {
          type: "object",
          properties: { path: stringParam, contents: stringParam },
          required: ["path", "contents"],
        },
      },
      run: async ({ path, contents }) => {
        const fullPath = workspace.resolve(path);
        workspace.write(fullPath, contents);
        report({
          type: "tool",
          name: "write_file",
          input: { path, contents },
          output: `записано ${fullPath}`,
          ok: true,
          escaped: !workspace.isInside(fullPath),
        });
        return `записано ${String(contents).length} символів у ${path}`;
      },
    },
  };
}

// ---------- як прохання моделі звучить людською мовою (для кадрів блоку «Що сталося»)
export function describeRequest(name, input = {}, esc) {
  if (name === "list_files") return `«Покажи, які файли є в папці <code>${esc(input.dir ?? ".")}</code>»`;
  if (name === "read_file") return `«Прочитай файл <code>${esc(input.path)}</code>»`;
  if (name === "write_file") return `«Запиши файл <code>${esc(input.path)}</code>»`;
  return null; // нехай сторінка скаже загальне «Натисни …»
}

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
