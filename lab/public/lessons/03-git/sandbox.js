// Пісочниця уроку 3: файли маленького проєкту + трекер + міні-git.
// Що лабораторія дає кодові: tracker — трекер напряму, як в уроці 2.
// Інструменти для моделі в tools: файли, трекер (list_tasks…) і git (git_branch, git_commit, open_mr, merge_mr).
// Цей модуль імпортують і worker (щоб запускати код), і сторінка (щоб описувати прохання людською мовою).
import { createFileTools, describeFileRequest } from "../../runtime/file-tools.js";
import {
  createTracker,
  createTrackerGlobal,
  createTrackerTools,
  describeTrackerRequest,
} from "../../runtime/tracker.js";
import { createRepo, createGitTools } from "../../runtime/git.js";

// ---------- файли проєкту на старті (шляхи відносно /work)
export const FILES = {
  "README.md": "# Мій проєкт\nМаленький сайт для уроку.\n",
  "src/config.js": 'export const title = "Мій проєкт";\nexport const lang = "uk";\n',
  "src/app.js": 'import { title } from "./config.js";\n\ndocument.title = title;\n',
};

// ---------- задачі на старті
const START_TASKS = [
  {
    id: "T-5",
    title: "Перейменувати сайт",
    description: "У файлі src/config.js зміни title на «Агентура». Більше нічого не чіпай.",
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
  const store = createTracker(START_TASKS, report);
  store.reportBoard(null);
  const repo = createRepo(workspace, report);
  repo.reportRepo();
  // Коли змінюється файл, панель git теж оновлюється: видно незакомічені зміни
  const reportFiles = workspace.reportFiles;
  workspace.reportFiles = () => {
    reportFiles();
    repo.reportRepo();
  };

  return { tracker: createTrackerGlobal(store, report), [STORE]: store, [REPO]: repo };
}

// ---------- інструменти для моделі, які дає сама лабораторія
export function createTools(workspace, report, globals) {
  return {
    ...createFileTools(workspace, report),
    ...createTrackerTools(globals[STORE], report),
    ...createGitTools(globals[REPO], report),
  };
}

// ---------- як прохання моделі звучить людською мовою (для кадрів блоку «Що сталося»)
// Назва може прийти з лабораторії (git_branch), від сервера (branch) або з префіксом (git__branch)
export function describeRequest(name, input = {}, esc) {
  const [server, bare] = name.includes("__") ? name.split("__") : [null, name];
  const via = server ? ` <span class="muted">(сервер ${esc(server)})</span>` : "";
  const say = (text) => text + via;

  if (["git_branch", "branch"].includes(bare)) return say(`«Створи гілку <code>${esc(input.name)}</code>»`);
  if (["git_commit", "commit"].includes(bare)) return say(`«Закоміть зміни: ${esc(input.message)}»`);
  if (["open_mr", "merge_request"].includes(bare)) return say(`«Відкрий merge request: ${esc(input.title)}»`);
  if (["merge_mr", "merge"].includes(bare))
    return say(`«Злий merge request <code>${esc(input.id)}</code> у main»`);
  if (bare === "list_mrs" || (bare === "list" && server === "git")) return say("«Покажи merge request'и»");

  // Трекер: від сервера назви короткі (list, get, update, comment), у лабораторії — list_tasks…
  const trackerName = { list: "list_tasks", get: "get_task", update: "update_task", comment: "add_comment" }[
    bare
  ];
  const tracker = describeTrackerRequest(trackerName ?? bare, input, esc);
  if (tracker) return say(tracker);
  return describeFileRequest(bare, input, esc);
}

// ---------- заготовка моделі
// Це СЦЕНАРІЙ, а не модель. Дивиться на задачу, інструкцію (system) і доступні інструменти
// і робить наступний крок за планом. Назви інструментів бувають різні (git_branch, branch, git__branch),
// тому шукає їх за закінченням.
//   є інструмент гілки → спершу гілка agent/T-5
//   читає src/config.js → записує новий title
//   є коміт → комітить; є open_mr → відкриває MR
//   є merge і в інструкції «до кінця» → зливає сам (крок 3 показує, чому так не можна)
//   є коментар і статус трекера → звітує в задачі
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
  const lastResult = String(results.at(-1)?.content ?? "");

  const taskId = question.match(/T-\d+/)?.[0];
  if (!taskId) return answer("Дайте мені задачу з трекера, і я візьмусь.");

  const branch = find("git_branch", "branch");
  const read = find("read_file");
  const write = find("write_file");
  const commit = find("git_commit", "commit");
  const openMr = find("open_mr", "merge_request");
  const merge = find("merge_mr", "merge");
  const comment = find("add_comment", "comment");
  const update = find("update_task", "update");

  const mrId = results.map((r) => String(r.content).match(/merge request (!\d+)/)?.[1]).find(Boolean);
  const title = "T-5: назва сайту «Агентура»";

  if (branch && !didAsk(branch)) return ask(branch, { name: `agent/${taskId}` });
  if (read && !didAsk(read)) return ask(read, { path: "src/config.js" });
  if (write && !didAsk(write)) {
    const current = String(results.find((r) => String(r.content).includes("export const"))?.content ?? "");
    const next = current
      ? current.replace(/title = ".*?"/, 'title = "Агентура"')
      : 'export const title = "Агентура";\n';
    return ask(write, { path: "src/config.js", contents: next });
  }
  if (commit && !didAsk(commit)) return ask(commit, { message: title });
  if (openMr && !didAsk(openMr)) {
    return ask(openMr, {
      title,
      description: "Змінив title у src/config.js на «Агентура». Більше нічого не чіпав.",
    });
  }
  if (merge && mrId && /до кінця/i.test(system) && !didAsk(merge)) return ask(merge, { id: mrId });

  const merged = didAsk(merge ?? "-") && /злито/.test(lastResult + results.map((r) => r.content).join(" "));
  const whatDone = mrId
    ? merged
      ? `змінив назву сайту і сам злив ${mrId} у main`
      : `змінив назву сайту, зміни в merge request ${mrId}`
    : commit
      ? "змінив назву сайту, коміт у гілці agent/T-5"
      : "змінив назву сайту в src/config.js";
  if (comment && !didAsk(comment)) return ask(comment, { id: taskId, text: `Готово: ${whatDone}.` });
  if (update && !didAsk(update)) return ask(update, { id: taskId, status: merged ? "done" : "review" });
  return answer(`Зробив задачу ${taskId}: ${whatDone}.`);
}
