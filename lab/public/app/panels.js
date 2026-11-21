// Панелі під блоком «Що сталося»: показують стан пісочниці наживо.
// Крок вмикає потрібні панелі полем panels, наприклад panels: ["files"] або ["board"].
import { esc } from "./util.js";

// Яка подія з worker оновлює який стан
export const STATE_EVENTS = {
  fs: (state, event) => (state.files = event.files),
  tracker: (state, event) => {
    state.tasks = event.tasks;
    state.statuses = event.statuses;
  },
  git: (state, event) => (state.git = event),
};

const STATUSES = [
  ["todo", "Треба зробити"],
  ["in_progress", "В роботі"],
  ["review", "На перевірці"],
  ["done", "Готово"],
];

const RENDERERS = {
  // Файли робочої папки агента; червоне — те, що вийшло за її межі
  files(state) {
    const items = (state.files ?? [])
      .map((file) => `<li class="${file.startsWith("/work/") ? "" : "out"}">${esc(file)}</li>`)
      .join("");
    return `<b>Файли</b> <span class="muted">— робоча папка агента <code>/work</code>; червоне — поза нею</span><ul class="files">${items}</ul>`;
  },

  // Дошка задач трекера
  board(state) {
    const tasks = state.tasks ?? [];
    const card = (task) => {
      const labels = (task.labels ?? []).map((l) => `<span class="tag">${esc(l)}</span>`).join("");
      const who = task.assignee ? `<span class="who">${esc(task.assignee)}</span>` : "";
      const comments = task.comments?.length
        ? `<details class="card-comments"><summary>коментарі: ${task.comments.length}</summary>${task.comments
            .map((c) => `<p><b>${esc(c.author)}:</b> ${esc(c.text)}</p>`)
            .join("")}</details>`
        : "";
      return `<div class="card${task.changed ? " changed" : ""}"><div class="card-top"><code>${esc(task.id)}</code>${labels}${who}</div><div class="card-title">${esc(task.title)}</div>${comments}</div>`;
    };
    // Колонки — ті статуси, які знає трекер (в уроці 4 їх п'ять)
    const columns = (state.statuses ?? STATUSES)
      .map(
        ([status, name]) =>
          `<div class="col"><div class="col-h">${name}</div>${tasks
            .filter((t) => t.status === status)
            .map(card)
            .join("")}</div>`,
      )
      .join("");
    return `<b>Трекер</b> <span class="muted">— дошка оновлюється наживо, жовтим підсвічено те, що змінилось</span><div class="board" style="--cols: ${(state.statuses ?? STATUSES).length}">${columns}</div>`;
  },
};

// Гілки, коміти і merge request'и міні-git
RENDERERS.git = (state) => {
  const git = state.git;
  if (!git) return "<b>Git</b>";
  const hot = (id) => (git.highlight === id ? " changed" : "");
  const branches = git.branches
    .map((branch) => {
      const here = branch.name === git.head ? ` <span class="muted">← поточна гілка</span>` : "";
      const commits = branch.commits.length
        ? branch.commits
            .map(
              (c) =>
                `<li class="${hot(c.id)}"><code>${esc(c.id)}</code> ${esc(c.message)} <span class="muted">· ${esc(c.author)}</span></li>`,
            )
            .join("")
        : `<li class="muted">нових комітів немає</li>`;
      const dirty =
        branch.name === git.head && git.changed.length
          ? `<li class="dirty">не закомічено: ${git.changed.map((f) => `<code>${esc(f)}</code>`).join(", ")}</li>`
          : "";
      return `<div class="branch${hot(branch.name)}"><b>${esc(branch.name)}</b>${here}<ul>${commits}${dirty}</ul></div>`;
    })
    .join("");
  const mrs = git.mrs
    .map((mr) => {
      const status =
        mr.status === "merged" ? `злитий${mr.mergedBy ? ` (${esc(mr.mergedBy)})` : ""}` : "чекає перевірки";
      const diff = Object.entries(mr.diff)
        .map(
          ([file, lines]) =>
            `<div class="diff-file"><code>${esc(file)}</code><pre>${lines
              .map((l) => `<span class="${l.startsWith("+") ? "add" : "del"}">${esc(l)}</span>`)
              .join("\n")}</pre></div>`,
        )
        .join("");
      return `<div class="mr ${mr.status}${hot(mr.id)}"><div><code>${esc(mr.id)}</code> ${esc(mr.title)} <span class="muted">· ${esc(mr.branch)} → main · ${status}</span></div>${mr.description ? `<div class="muted">${esc(mr.description)}</div>` : ""}<details><summary>Зміни</summary>${diff}</details></div>`;
    })
    .join("");
  return `<b>Git</b> <span class="muted">— гілки, коміти і merge request'и; жовтим підсвічено те, що змінилось</span><div class="git">${branches}</div>${mrs ? `<div class="mrs"><b>Merge request'и</b>${mrs}</div>` : ""}`;
};

// Малює всі увімкнені панелі кроку під блоком «Що сталося»
export function drawPanels(container, panelNames, state) {
  for (const name of panelNames ?? []) {
    const render = RENDERERS[name];
    if (!render) continue;
    let panel = container.querySelector(`.panel-${name}`);
    if (!panel) {
      panel = document.createElement("div");
      panel.className = `panel panel-${name}`;
      container.appendChild(panel);
    }
    panel.innerHTML = render(state);
  }
}
