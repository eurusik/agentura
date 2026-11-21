// Пісочниця уроку 4: проєкт з уроку 3 + трекер, який навчився статусу blocked, + MCP-сервери.
// Що лабораторія дає кодові:
//   tracker — трекер напряму, як в уроках 2–3;
//   mcp     — MCP: mcp.connect("tracker"), mcp.connect("git"), а в кроці 6 і mcp.serve(name, tools).
// Інструменти для моделі в tools — ті самі, що в уроці 3. Інструменти трекера в них описані
// ще до статусу blocked: саме це показує крок 1.
// Цей модуль імпортують і worker (щоб запускати код), і сторінка (щоб описувати прохання людською мовою).
import { createFileTools, describeFileRequest } from "../../runtime/file-tools.js";
import {
  NEW_STATUS_NAMES,
  createTracker,
  createTrackerGlobal,
  createTrackerTools,
  describeTrackerRequest,
} from "../../runtime/tracker.js";
import { createRepo, createGitTools, createGitServerTools } from "../../runtime/git.js";
import { createMcp } from "../../runtime/mcp.js";

// ---------- файли проєкту на старті (шляхи відносно /work), як в уроці 3
export const FILES = {
  "README.md": "# Мій проєкт\nМаленький сайт для уроку.\n",
  "src/config.js": 'export const title = "Мій проєкт";\nexport const lang = "uk";\n',
  "src/app.js": 'import { title } from "./config.js";\n\ndocument.title = title;\n',
};

// ---------- задачі на старті
const START_TASKS = [
  {
    id: "T-6",
    title: "Оновити версію сайту",
    description:
      "У src/config.js зміни version на 1.1. Якщо там немає version, нічого не вигадуй: переведи задачу в статус blocked і напиши в коментарі чому.",
    labels: ["agent"],
    status: "todo",
  },
  {
    id: "T-7",
    title: "Додати версію сайту",
    description: 'Додай у src/config.js рядок export const version = "1.1"; Більше нічого не чіпай.',
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
];

// ---------- що дає лабораторія кодові
const STORE = Symbol("store");
const REPO = Symbol("repo");

export function createGlobals(workspace, report) {
  // Трекер уже знає п'ять статусів, зокрема blocked
  const store = createTracker(START_TASKS, report, NEW_STATUS_NAMES);
  store.reportBoard(null);
  const repo = createRepo(workspace, report);
  repo.reportRepo();
  // Коли змінюється файл, панель git теж оновлюється: видно незакомічені зміни
  const reportFiles = workspace.reportFiles;
  workspace.reportFiles = () => {
    reportFiles();
    repo.reportRepo();
  };

  // Сервер трекера: його пише команда трекера, тому він знає всі статуси.
  // Назви в нього свої, короткі: list, get, update, comment
  const t = createTrackerTools(store, () => {}, NEW_STATUS_NAMES);
  const rename = (tool, name) => ({ ...tool, def: { ...tool.def, name } });
  const trackerServer = {
    tools: {
      list: rename(t.list_tasks, "list"),
      get: rename(t.get_task, "get"),
      update: rename(t.update_task, "update"),
      comment: rename(t.add_comment, "comment"),
    },
  };

  const mcp = createMcp({ tracker: trackerServer, git: { tools: createGitServerTools(repo) } }, report);
  return { tracker: createTrackerGlobal(store, report), mcp, [STORE]: store, [REPO]: repo };
}

// ---------- інструменти для моделі, які дає сама лабораторія (як в уроці 3)
export function createTools(workspace, report, globals) {
  return {
    ...createFileTools(workspace, report),
    // Описані ще тоді, коли статусів було чотири
    ...createTrackerTools(globals[STORE], report),
    ...createGitTools(globals[REPO], report),
  };
}

// ---------- як прохання моделі звучить людською мовою (для кадрів блоку «Що сталося»)
// Назва може прийти з лабораторії (update_task), від сервера (update) або з префіксом (tracker__update)
export function describeRequest(name, input = {}, esc) {
  const [server, bare] = name.includes("__") ? name.split("__") : [null, name];
  const via = server ? ` <span class="muted">(сервер ${esc(server)})</span>` : "";
  const say = (text) => (text ? text + via : null);

  const git = {
    git_branch: () => `«Створи гілку <code>${esc(input.name)}</code>»`,
    branch: () => `«Створи гілку <code>${esc(input.name)}</code>»`,
    git_commit: () => `«Закоміть зміни: ${esc(input.message)}»`,
    commit: () => `«Закоміть зміни: ${esc(input.message)}»`,
    open_mr: () => `«Відкрий merge request: ${esc(input.title)}»`,
    merge_request: () => `«Відкрий merge request: ${esc(input.title)}»`,
    merge_mr: () => `«Злий merge request <code>${esc(input.id)}</code> у main»`,
    merge: () => `«Злий merge request <code>${esc(input.id)}</code> у main»`,
    list_mrs: () => "«Покажи merge request'и»",
    log: () => "«Покажи історію комітів»",
    diff: () => "«Покажи зміни відносно main»",
    branches: () => "«Покажи гілки»",
    tag: () => `«Постав тег <code>${esc(input.name)}</code>»`,
  };
  if (bare === "list" && server === "git") return say("«Покажи merge request'и»");
  if (git[bare]) return say(git[bare]());
  if (bare === "who_reviews") return say(`«Хто переглядає <code>${esc(input.path)}</code>?»`);

  // Трекер: від сервера назви короткі (list, get, update, comment), у лабораторії — list_tasks…
  const trackerName = { list: "list_tasks", get: "get_task", update: "update_task", comment: "add_comment" }[
    bare
  ];
  return (
    say(describeTrackerRequest(trackerName ?? bare, input, esc)) ?? describeFileRequest(bare, input, esc)
  );
}

// ---------- заготовка моделі
// Це СЦЕНАРІЙ, а не модель. Дивиться на задачу, інструкцію (system) і доступні інструменти
// і робить наступний крок за планом. Назви інструментів бувають різні (update_task, update,
// tracker__update), тому шукає їх за закінченням.
//   T-6: читає config → version немає → якщо в описі статусів є blocked, ставить blocked,
//        інакше пише в коментарі, що такого статусу немає
//   T-7: гілка → читає → дописує version → коміт → (хто переглядає) → merge request →
//        (зливає сам, якщо є merge і в інструкції «до кінця») → коментар → статус
let nextId = 0;
const ask = (name, input) => ({
  content: [{ type: "tool_use", id: `toolu_${++nextId}`, name, input }],
  stop_reason: "tool_use",
});
const answer = (text) => ({ content: [{ type: "text", text }], stop_reason: "end_turn" });

export function stubModel({ system = "", messages, tools: toolList = [] }) {
  const names = toolList.map((tool) => tool.name);
  const find = (...variants) =>
    names.find((name) => variants.some((v) => name === v || name.endsWith(`__${v}`)));
  const question = typeof messages[0]?.content === "string" ? messages[0].content : "";
  const asked = messages
    .filter((m) => m.role === "assistant" && Array.isArray(m.content))
    .flatMap((m) => m.content.filter((part) => part.type === "tool_use"));
  const didAsk = (name) => asked.some((r) => r.name === name);
  const results = messages
    .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
    .filter((part) => part.type === "tool_result");
  const allResults = results.map((r) => String(r.content)).join("\n");

  const taskId = question.match(/T-\d+/)?.[0];
  if (!taskId) return answer("Дайте мені задачу з трекера, і я візьмусь.");

  const read = find("read_file");
  const write = find("write_file");
  const comment = find("add_comment", "comment");
  const update = find("update_task", "update");

  if (taskId === "T-6") {
    if (read && !didAsk(read)) return ask(read, { path: "src/config.js" });
    // Чи є blocked в описі інструмента статусу, який ми отримали?
    const statusEnum = toolList.find((t) => t.name === update)?.input_schema?.properties?.status?.enum ?? [];
    const why = "у src/config.js немає version, змінювати нічого";
    if (statusEnum.includes("blocked")) {
      if (update && !didAsk(update)) return ask(update, { id: "T-6", status: "blocked" });
      if (comment && !didAsk(comment)) return ask(comment, { id: "T-6", text: `Заблоковано: ${why}.` });
      return answer(`Задача T-6 заблокована: ${why}.`);
    }
    if (comment && !didAsk(comment)) {
      return ask(comment, {
        id: "T-6",
        text: `Не можу виконати: ${why}. Треба перевести задачу в blocked, але такого статусу в описі інструмента немає.`,
      });
    }
    return answer("Задачу T-6 зробити не можна, а статусу blocked у мене немає. Лишаю задачу як є.");
  }

  // T-7 (і будь-яка інша задача): повна дорога з уроку 3
  const branch = find("git_branch", "branch");
  const commit = find("git_commit", "commit");
  const openMr = find("open_mr", "merge_request");
  const merge = find("merge_mr", "merge");
  const whoReviews = find("who_reviews");

  const mrId = allResults.match(/merge request (!\d+)/)?.[1];
  const reviewer = whoReviews ? results.find((r, i) => asked[i]?.name === whoReviews)?.content : null;
  const title = `${taskId}: версія сайту 1.1`;

  if (branch && !didAsk(branch)) return ask(branch, { name: `agent/${taskId}` });
  if (read && !didAsk(read)) return ask(read, { path: "src/config.js" });
  if (write && !didAsk(write)) {
    const current = String(results.find((r) => String(r.content).includes("export const"))?.content ?? "");
    return ask(write, { path: "src/config.js", contents: `${current}export const version = "1.1";\n` });
  }
  if (commit && !didAsk(commit)) return ask(commit, { message: title });
  if (whoReviews && !didAsk(whoReviews)) return ask(whoReviews, { path: "src/config.js" });
  if (openMr && !didAsk(openMr)) {
    const who = reviewer ? ` Перегляне: ${reviewer}.` : "";
    return ask(openMr, { title, description: `Додав version = 1.1 у src/config.js.${who}` });
  }
  if (merge && mrId && /до кінця/i.test(system) && !didAsk(merge)) return ask(merge, { id: mrId });

  const merged = /злито/.test(allResults);
  const whatDone = mrId
    ? merged
      ? `додав версію і сам злив ${mrId} у main`
      : `додав версію, зміни в merge request ${mrId}`
    : "додав версію в src/config.js";
  if (comment && !didAsk(comment)) return ask(comment, { id: taskId, text: `Готово: ${whatDone}.` });
  if (update && !didAsk(update)) return ask(update, { id: taskId, status: merged ? "done" : "review" });
  return answer(`Зробив задачу ${taskId}: ${whatDone}.`);
}
