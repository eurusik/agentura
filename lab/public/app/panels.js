// Панелі під блоком «Що сталося»: показують стан пісочниці наживо.
// Крок вмикає потрібні панелі полем panels, наприклад panels: ["files"] або ["board"].
import { esc } from "./util.js";

// Яка подія з worker оновлює який стан
export const STATE_EVENTS = {
  fs: (state, event) => (state.files = event.files),
  tracker: (state, event) => (state.tasks = event.tasks),
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
    const columns = STATUSES.map(
      ([status, name]) =>
        `<div class="col"><div class="col-h">${name}</div>${tasks
          .filter((t) => t.status === status)
          .map(card)
          .join("")}</div>`,
    ).join("");
    return `<b>Трекер</b> <span class="muted">— дошка оновлюється наживо, жовтим підсвічено те, що змінилось</span><div class="board">${columns}</div>`;
  },
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
