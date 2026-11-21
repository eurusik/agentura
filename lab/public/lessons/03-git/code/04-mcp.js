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
        // Файли і трекер дає лабораторія: запускаємо їх самі, як раніше
        result = await tools[request.name].run(request.input);
      } else {
        // Нове: інструменти git прийшли від сервера git.
        // Самі ми їх не запускаємо, а передаємо прохання серверу
        result = await git.callTool(request.name, request.input);
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

// Нове: підключаємось до сервера git
const git = await mcp.connect("git");

// і питаємо, які в нього інструменти (це запит tools/list)
const gitTools = await git.listTools();

// Сервер віддає всі свої інструменти, зокрема merge.
// Але зливати агенту не даємо, як у кроці 3: merge викидаємо зі списку
const toolList = [
  tools.read_file.def,
  tools.write_file.def,
  tools.add_comment.def,
  tools.update_task.def,
  ...gitTools.filter((tool) => tool.name !== "merge"),
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
