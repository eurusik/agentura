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
        // Нове: у назві є ім'я сервера. git__branch означає
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

// Код бере першу задачу для агента і забирає її собі (урок 2)
const [task] = tracker.list({ label: "agent", status: "todo" });
tracker.update(task.id, { status: "in_progress", assignee: "агент" });

// Підключаємось до обох серверів і питаємо їхні інструменти, як і раніше
const git = await mcp.connect("git");
const trackerServer = await mcp.connect("tracker");
const allGitTools = await git.listTools();
const gitTools = allGitTools.filter((tool) => tool.name !== "merge");
const trackerTools = await trackerServer.listTools();

// Нове: перед назвою кожного інструмента дописуємо ім'я сервера.
// Були два list, а стали git__list і tracker__list
function withServerName(server, defs) {
  return defs.map((def) => ({ ...def, name: `${server.name}__${def.name}` }));
}

// Сервери за іменем: з префікса runTools дізнається ім'я і бере сервер звідси
const servers = { git, tracker: trackerServer };

const toolList = [
  tools.read_file.def,
  tools.write_file.def,
  ...withServerName(trackerServer, trackerTools),
  ...withServerName(git, gitTools),
];
const instructions =
  "Ти агент-розробник і виконуєш задачі з трекера. " +
  "Спершу створи гілку: agent/ і номер задачі, наприклад agent/T-1. " +
  "Перш ніж змінити файл, прочитай його. " +
  "Наприкінці закоміть зміни з коротким описом. " +
  "Після коміту відкрий merge request, напиши в задачі коментар " +
  "з його номером і переведи задачу в статус review. " +
  "Коротко, українською.";

await runAgent(task, toolList, instructions);
