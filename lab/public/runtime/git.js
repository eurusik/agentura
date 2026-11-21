// Маленький git для уроків 3 і далі. Працює з тією самою віртуальною папкою /work, що й файлові інструменти.
// Усе спрощено до того, що потрібно агенту:
//   - коміт — це знімок усіх файлів папки;
//   - гілка — це назва, яка вказує на свій останній коміт;
//   - merge request — прохання злити гілку в main; зливає людина.

const WORK = "/work";

// Рядки, яких немає в старому тексті, — з «+», зниклі — з «−». Для маленьких файлів цього досить.
function diffLines(before = "", after = "") {
  const a = before.split("\n");
  const b = after.split("\n");
  // Найдовша спільна послідовність рядків
  const lcs = a.map(() => new Array(b.length + 1).fill(0));
  lcs.push(new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      i++;
      j++;
    } else if (i < a.length && (j >= b.length || lcs[i + 1][j] >= lcs[i][j + 1])) {
      if (a[i] !== "") out.push(`− ${a[i]}`);
      i++;
    } else {
      if (b[j] !== "") out.push(`+ ${b[j]}`);
      j++;
    }
  }
  return out;
}

// Різниця між двома знімками: { "src/config.js": ["− …", "+ …"] }
function diffSnapshots(before, after) {
  const result = {};
  for (const file of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (before[file] === after[file]) continue;
    result[file] = diffLines(before[file], after[file]);
  }
  return result;
}

export function createRepo(workspace, report) {
  // Знімок файлів папки: { "src/config.js": "…" }
  const snapshot = () =>
    Object.fromEntries(workspace.list(WORK).map((file) => [file, workspace.read(`${WORK}/${file}`)]));

  const commits = [
    { id: "c1", parent: null, message: "Початок проєкту", author: "людина", files: snapshot() },
  ];
  const branches = { main: "c1" };
  let head = "main"; // на якій гілці ми зараз
  const mrs = [];

  const commitById = (id) => commits.find((c) => c.id === id);
  const tip = (branch) => commitById(branches[branch]);
  const changedFiles = () => Object.keys(diffSnapshots(tip(head).files, snapshot()));

  // Коміти гілки, яких ще немає в main
  const ownCommits = (branch) => {
    const inMain = new Set();
    for (let c = tip("main"); c; c = commitById(c.parent)) inMain.add(c.id);
    const own = [];
    for (let c = tip(branch); c && !inMain.has(c.id); c = commitById(c.parent)) own.unshift(c);
    return own;
  };

  // Панель git під кодом перемальовується після кожної зміни
  const reportRepo = (changed = null) =>
    report({
      type: "git",
      head,
      changed: changedFiles(),
      branches: Object.keys(branches).map((name) => ({
        name,
        commits: (name === "main" ? mainHistory() : ownCommits(name)).map(({ id, message, author }) => ({
          id,
          message,
          author,
        })),
      })),
      mrs: mrs.map((mr) => ({ ...mr })),
      highlight: changed,
    });

  const mainHistory = () => {
    const list = [];
    for (let c = tip("main"); c; c = commitById(c.parent)) list.unshift(c);
    return list;
  };

  const repo = {
    status() {
      return { branch: head, changed: changedFiles() };
    },
    branch(name) {
      if (!name) throw new Error("потрібна назва гілки");
      if (branches[name]) throw new Error(`гілка ${name} уже є`);
      branches[name] = branches[head];
      head = name;
      reportRepo(name);
      return `створено гілку ${name} і перейшли на неї`;
    },
    commit(message, author) {
      const changed = changedFiles();
      if (!changed.length) throw new Error("немає змін, комітити нічого");
      const id = `c${commits.length + 1}`;
      commits.push({ id, parent: branches[head], message: String(message ?? ""), author, files: snapshot() });
      branches[head] = id;
      reportRepo(id);
      return `коміт ${id} у гілці ${head}: ${changed.join(", ")}`;
    },
    openMr(title, description) {
      if (head === "main") throw new Error("merge request відкривають з окремої гілки, а зараз ти в main");
      if (!ownCommits(head).length) throw new Error(`у гілці ${head} ще немає комітів`);
      const id = `!${mrs.length + 1}`;
      const diff = diffSnapshots(tip("main").files, tip(head).files);
      mrs.push({
        id,
        title: String(title ?? ""),
        description: String(description ?? ""),
        branch: head,
        status: "open",
        diff,
      });
      reportRepo(id);
      return `відкрито merge request ${id}: ${head} → main`;
    },
    merge(id, who) {
      const mr = mrs.find((m) => m.id === id);
      if (!mr) throw new Error(`merge request ${id} немає`);
      if (mr.status !== "open") throw new Error(`merge request ${id} уже злитий`);
      branches.main = branches[mr.branch];
      mr.status = "merged";
      mr.mergedBy = who;
      reportRepo(id);
      return `${id} злито в main`;
    },
    listMrs() {
      return (
        mrs.map((m) => `${m.id} [${m.status}] ${m.title} (${m.branch} → main)`).join("\n") ||
        "(merge request'ів немає)"
      );
    },
    reportRepo,
  };
  return repo;
}

// ---------- інструменти git для моделі
const stringParam = { type: "string" };

/**
 * @param names як назвати інструменти: у лабораторії git_branch…, а сервер git називає їх по-своєму
 * @param report куди повідомляти про запуск; сервер повідомляє сам, тому там це () => {}
 */
export function createGitTools(repo, report, names = {}) {
  const n = {
    branch: "git_branch",
    commit: "git_commit",
    open_mr: "open_mr",
    merge: "merge_mr",
    list: "list_mrs",
    ...names,
  };
  const wrap =
    (name, fn) =>
    async (input = {}) => {
      try {
        const output = fn(input);
        report({ type: "tool", name, input, output, ok: true });
        return output;
      } catch (error) {
        report({ type: "tool", name, input, output: error.message, ok: false });
        throw error;
      }
    };
  return {
    [n.branch]: {
      def: {
        name: n.branch,
        description: "Create a new git branch from the current one and switch to it.",
        input_schema: { type: "object", properties: { name: stringParam }, required: ["name"] },
      },
      run: wrap(n.branch, ({ name }) => repo.branch(name)),
    },
    [n.commit]: {
      def: {
        name: n.commit,
        description: "Commit all changed files in the current branch with a short message.",
        input_schema: { type: "object", properties: { message: stringParam }, required: ["message"] },
      },
      run: wrap(n.commit, ({ message }) => repo.commit(message, "агент")),
    },
    [n.open_mr]: {
      def: {
        name: n.open_mr,
        description: "Open a merge request from the current branch into main, so a human can review it.",
        input_schema: {
          type: "object",
          properties: { title: stringParam, description: stringParam },
          required: ["title"],
        },
      },
      run: wrap(n.open_mr, ({ title, description }) => repo.openMr(title, description)),
    },
    [n.merge]: {
      def: {
        name: n.merge,
        description: "Merge a merge request into main, e.g. '!1'.",
        input_schema: { type: "object", properties: { id: stringParam }, required: ["id"] },
      },
      run: wrap(n.merge, ({ id }) => repo.merge(id, "агент")),
    },
    [n.list]: {
      def: {
        name: n.list,
        description: "List merge requests and their status.",
        input_schema: { type: "object", properties: {} },
      },
      run: wrap(n.list, () => repo.listMrs()),
    },
  };
}
