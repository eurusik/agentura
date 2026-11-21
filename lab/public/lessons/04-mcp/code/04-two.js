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
      if (tools[request.name]) {
        // Файли дає лабораторія: запускаємо їх самі
        result = await tools[request.name].run(request.input);
      } else {
        // Решта прийшла від серверів. У таблиці owner (нижче) шукаємо,
        // від якого саме, і передаємо прохання йому
        const server = owner[request.name];
        result = await server.callTool(request.name, request.input);
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

// Код бере задачу T-7 і забирає її собі (урок 2): її можна зробити до кінця
const task = tracker.get("T-7");
tracker.update(task.id, { status: "in_progress", assignee: "агент" });

// Підключаємось до обох серверів і питаємо їхні інструменти
const trackerServer = await mcp.connect("tracker");
const gitServer = await mcp.connect("git");
const trackerTools = await trackerServer.listTools();
const gitTools = await gitServer.listTools();

// Таблиця «інструмент → сервер, від якого він прийшов».
// Наприклад, owner.branch — це сервер git. За нею runTools знає,
// кому передати прохання моделі
const owner = {};
for (const tool of trackerTools) owner[tool.name] = trackerServer;
for (const tool of gitTools) owner[tool.name] = gitServer;

// Від лабораторії тільки файли. Усе інше — від серверів
const toolList = [
  tools.read_file.def,
  tools.write_file.def,
  ...trackerTools,
  ...gitTools,
];
// Інструкція з уроку 3
const instructions =
  "Ти агент-розробник і виконуєш задачі з трекера. " +
  "Спершу створи гілку: agent/ і номер задачі, наприклад agent/T-1. " +
  "Перш ніж змінити файл, прочитай його. " +
  "Наприкінці закоміть зміни з коротким описом. " +
  "Після коміту відкрий merge request, напиши в задачі коментар " +
  "з його номером і переведи задачу в статус review. " +
  "Коротко, українською.";

await runAgent(task, toolList, instructions);
