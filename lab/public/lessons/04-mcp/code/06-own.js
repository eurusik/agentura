// Дістає з відповіді моделі її прохання запустити інструмент (з уроку 1)
function getRequests(reply) {
  return reply.content.filter((part) => part.type === "tool_use");
}

// Запускає інструменти, які попросила модель
async function runTools(requests) {
  const results = [];
  for (const request of requests) {
    try {
      let result;
      if (request.name.includes("__")) {
        // У назві є ім'я сервера. git__branch означає
        // «інструмент branch від сервера git». Розрізаємо назву навпіл
        // і передаємо прохання цьому серверу вже з короткою назвою
        const [serverName, toolName] = request.name.split("__");
        result = await servers[serverName].callTool(toolName, request.input);
      } else {
        // Без префікса — файли від лабораторії: запускаємо їх самі
        result = await tools[request.name].run(request.input);
      }
      results.push({
        type: "tool_result",
        tool_use_id: request.id,
        content: result,
      });
    } catch (error) {
      // Інструмент впав — кажемо моделі, що сталось, і хай пробує інакше
      results.push({
        type: "tool_result",
        tool_use_id: request.id,
        content: `помилка: ${error.message}`,
        is_error: true,
      });
    }
  }
  return results;
}

// Агент з уроку 2: отримує задачу і крутить свій цикл, щонайбільше 10 кіл
async function runAgent(task, toolList, instructions) {
  const messages = [
    {
      role: "user",
      content: `Задача ${task.id}: ${task.title}\n${task.description}`,
    },
  ];

  for (let turn = 1; turn <= 10; turn++) {
    const reply = await model({
      system: instructions,
      messages,
      tools: toolList,
    });
    messages.push({ role: "assistant", content: reply.content });

    // Модель нічого не просить — значить, задачу закінчено. Виходимо
    const requests = getRequests(reply);
    if (requests.length === 0) return;

    const results = await runTools(requests);
    messages.push({ role: "user", content: results });
  }
}

// Нове: наш сервер team з одним інструментом, який каже, хто переглядає файл
mcp.serve("team", {
  who_reviews: {
    def: {
      name: "who_reviews",
      description: "Who reviews changes in a file. Returns a name.",
      input_schema: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
    // Правило команди: код у src/ переглядає Олена, решту — Андрій
    run: async ({ path }) => (path.startsWith("src/") ? "Олена" : "Андрій"),
  },
});

// Код бере задачу T-7 і забирає її собі (урок 2)
const task = tracker.get("T-7");
tracker.update(task.id, { status: "in_progress", assignee: "агент" });

// Підключаємось до обох серверів і питаємо їхні інструменти
const trackerServer = await mcp.connect("tracker");
const gitServer = await mcp.connect("git");
const trackerTools = await trackerServer.listTools();
const gitTools = await gitServer.listTools();

// До нашого сервера підключаємось так само, як до чужих
const teamServer = await mcp.connect("team");
const teamTools = await teamServer.listTools();

function withServerName(server, defs) {
  return defs.map((def) => ({ ...def, name: `${server.name}__${def.name}` }));
}
const servers = { tracker: trackerServer, git: gitServer, team: teamServer };

// Від кожного сервера беремо тільки те, що потрібно для задачі
function pick(defs, names) {
  return defs.filter((def) => names.includes(def.name));
}
const trackerNeeded = pick(trackerTools, ["comment", "update"]);
const gitNeeded = pick(gitTools, ["branch", "commit", "merge_request"]);

const toolList = [
  tools.read_file.def,
  tools.write_file.def,
  ...withServerName(trackerServer, trackerNeeded),
  ...withServerName(gitServer, gitNeeded),
  ...withServerName(teamServer, teamTools),
];
// Нове в інструкції: дізнатись, хто переглядає зміни
const instructions =
  "Ти агент-розробник і виконуєш задачі з трекера. " +
  "Спершу створи гілку: agent/ і номер задачі, наприклад agent/T-1. " +
  "Перш ніж змінити файл, прочитай його. " +
  "Наприкінці закоміть зміни з коротким описом. " +
  "Після коміту відкрий merge request, напиши в задачі коментар " +
  "з його номером і переведи задачу в статус review. " +
  "Перед merge request дізнайся через who_reviews, хто переглядає " +
  "змінений файл, і впиши це в опис merge request. " +
  "Коротко, українською.";

await runAgent(task, toolList, instructions);
