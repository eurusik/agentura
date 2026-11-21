// Маленький трекер задач, спільний для уроків 2 і далі. Які задачі в ньому на старті, вирішує урок.
// Трекером можна користуватись двома способами:
//   - код звертається до нього напряму через об'єкт tracker (createTrackerGlobal);
//   - модель просить інструменти list_tasks, get_task, update_task, add_comment (createTrackerTools).

export const STATUS_NAMES = {
  todo: "Треба зробити",
  in_progress: "В роботі",
  review: "На перевірці",
  done: "Готово",
};

// ---------- стан задач і дії з ними
export function createTracker(startTasks, report) {
  const tasks = startTasks.map((task) => ({ assignee: null, comments: [], ...structuredClone(task) }));
  const find = (id) => tasks.find((task) => task.id === id);

  // Дошка під кодом перемальовується після кожної зміни; змінену задачу підсвічуємо
  const reportBoard = (changedId) =>
    report({ type: "tracker", tasks: tasks.map((task) => ({ ...task, changed: task.id === changedId })) });

  const describe = (task) =>
    [
      `${task.id}: ${task.title}`,
      `Статус: ${task.status} (${STATUS_NAMES[task.status]})`,
      `Мітки: ${task.labels.join(", ") || "немає"} · Виконавець: ${task.assignee ?? "ніхто"}`,
      `Опис: ${task.description}`,
      ...task.comments.map((c) => `Коментар від ${c.author}: ${c.text}`),
    ].join("\n");

  const store = {
    list({ label, status } = {}) {
      return tasks.filter(
        (task) => (!label || task.labels.includes(label)) && (!status || task.status === status),
      );
    },
    get(id) {
      const task = find(id);
      if (!task) throw new Error(`задачі ${id} немає`);
      return task;
    },
    update(id, changes) {
      const task = store.get(id);
      if (changes.status && !STATUS_NAMES[changes.status]) {
        throw new Error(`статусу «${changes.status}» немає, є: ${Object.keys(STATUS_NAMES).join(", ")}`);
      }
      Object.assign(task, changes);
      reportBoard(id);
      return task;
    },
    comment(id, text, author) {
      const task = store.get(id);
      task.comments.push({ author, text: String(text) });
      reportBoard(id);
      return task;
    },
    describe,
    reportBoard,
  };
  return store;
}

// ---------- об'єкт tracker для коду: код звертається до трекера сам, без моделі.
// Кожну дію показуємо кадром «Код сам …», щоб було видно, що модель тут ні до чого.
export function createTrackerGlobal(store, report) {
  const said = (title, output, why) =>
    report({ type: "tool", byCode: true, name: "tracker", title, output, why, ok: true });

  return {
    list(filter = {}) {
      const found = store.list(filter);
      const what = [filter.label && `з міткою ${filter.label}`, filter.status && `у статусі ${filter.status}`]
        .filter(Boolean)
        .join(", ");
      said(
        `Код питає трекер: які задачі ${what || "є"}?`,
        found.map((task) => `${task.id}: ${task.title}`).join("\n") || "(таких задач немає)",
        "Це робить код, без моделі: просто запит до трекера за міткою і статусом.",
      );
      return found.map((task) => ({ ...task }));
    },
    get(id) {
      const task = store.get(id);
      said(`Код бере з трекера задачу ${id}`, store.describe(task), "Це робить код, без моделі.");
      return { ...task };
    },
    update(id, changes) {
      const task = store.update(id, changes);
      const parts = [
        changes.status && `статус → ${STATUS_NAMES[changes.status]}`,
        changes.assignee && `виконавець → ${changes.assignee}`,
      ].filter(Boolean);
      said(`Код оновлює ${id}: ${parts.join(", ")}`, store.describe(task), "Це робить код, без моделі.");
      return { ...task };
    },
    comment(id, text, author = "код") {
      const task = store.comment(id, text, author);
      said(`Код пише коментар до ${id}`, String(text), "Це робить код, без моделі.");
      return { ...task };
    },
  };
}

// ---------- інструменти трекера для моделі
const stringParam = { type: "string" };

export function createTrackerTools(store, report) {
  const done = (name, input, output) => report({ type: "tool", name, input, output, ok: true });
  const failed = (name, input, error) => {
    report({ type: "tool", name, input, output: error.message, ok: false });
    throw error;
  };

  return {
    list_tasks: {
      def: {
        name: "list_tasks",
        description: "List tasks in the tracker. Optional filters: label (e.g. 'agent') and status.",
        input_schema: { type: "object", properties: { label: stringParam, status: stringParam } },
      },
      run: async (input = {}) => {
        const found = store.list(input);
        const output =
          found
            .map((t) => `${t.id} [${t.status}] ${t.title} (мітки: ${t.labels.join(", ") || "немає"})`)
            .join("\n") || "(таких задач немає)";
        done("list_tasks", input, output);
        return output;
      },
    },

    get_task: {
      def: {
        name: "get_task",
        description: "Get one task by id: title, status, description and comments.",
        input_schema: { type: "object", properties: { id: stringParam }, required: ["id"] },
      },
      run: async (input) => {
        try {
          const output = store.describe(store.get(input.id));
          done("get_task", input, output);
          return output;
        } catch (error) {
          failed("get_task", input, error);
        }
      },
    },

    update_task: {
      def: {
        name: "update_task",
        description: "Change the status of a task. Status is one of: todo, in_progress, review, done.",
        input_schema: {
          type: "object",
          properties: { id: stringParam, status: { type: "string", enum: Object.keys(STATUS_NAMES) } },
          required: ["id", "status"],
        },
      },
      run: async (input) => {
        try {
          store.update(input.id, { status: input.status });
          const output = `${input.id} тепер у статусі ${input.status} (${STATUS_NAMES[input.status]})`;
          done("update_task", input, output);
          return output;
        } catch (error) {
          failed("update_task", input, error);
        }
      },
    },

    add_comment: {
      def: {
        name: "add_comment",
        description: "Add a comment to a task, e.g. what was done or a question to the author.",
        input_schema: {
          type: "object",
          properties: { id: stringParam, text: stringParam },
          required: ["id", "text"],
        },
      },
      run: async (input) => {
        try {
          store.comment(input.id, input.text, "агент");
          done("add_comment", input, `коментар додано до ${input.id}`);
          return `коментар додано до ${input.id}`;
        } catch (error) {
          failed("add_comment", input, error);
        }
      },
    },
  };
}

// ---------- як прохання до трекера звучить людською мовою (для кадрів блоку «Що сталося»)
export function describeTrackerRequest(name, input = {}, esc) {
  if (name === "list_tasks") {
    return input.label
      ? `«Покажи задачі з міткою <code>${esc(input.label)}</code>»`
      : "«Покажи задачі в трекері»";
  }
  if (name === "get_task") return `«Покажи задачу <code>${esc(input.id)}</code>»`;
  if (name === "update_task") {
    return `«Переведи <code>${esc(input.id)}</code> у статус «${esc(STATUS_NAMES[input.status] ?? input.status)}»»`;
  }
  if (name === "add_comment") return `«Напиши коментар до <code>${esc(input.id)}</code>: ${esc(input.text)}»`;
  return null;
}
