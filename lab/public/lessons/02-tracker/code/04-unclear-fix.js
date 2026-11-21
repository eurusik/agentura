// Дістає з відповіді моделі її прохання запустити інструмент (з уроку 1)
function getRequests(reply) {
  return reply.content.filter((part) => part.type === "tool_use");
}

// Запускає інструменти і повертає результати; помилку віддає моделі (з уроку 1)
async function runTools(requests) {
  const results = [];
  for (const request of requests) {
    try {
      const result = await tools[request.name].run(request.input);
      results.push({
        type: "tool_result",
        tool_use_id: request.id,
        content: result,
      });
    } catch (error) {
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

// Агент з уроку 1: отримує задачу текстом і крутить цикл, не більше 5 кіл
async function runAgent(task, toolList, instructions) {
  const messages = [
    {
      role: "user",
      content: `Задача ${task.id}: ${task.title}\n${task.description}`,
    },
  ];
  for (let turn = 1; turn <= 5; turn++) {
    const reply = await model({
      system: instructions,
      messages,
      tools: toolList,
    });
    messages.push({ role: "assistant", content: reply.content });

    const requests = getRequests(reply);
    if (requests.length === 0) return;

    const results = await runTools(requests);
    messages.push({ role: "user", content: results });
  }
}

// Цього разу в черзі розмита задача T-4
const task = tracker.get("T-4");
tracker.update(task.id, { status: "in_progress", assignee: "агент" });

// Тепер агент може ще й звітувати в трекер
const toolList = [
  tools.read_file.def,
  tools.write_file.def,
  tools.add_comment.def,
  tools.update_task.def,
];

// Нове в інструкції: що робити, якщо задача незрозуміла
const instructions =
  "Ти агент-розробник і виконуєш задачі з трекера. " +
  "Коли закінчиш, напиши в задачі коментар, що саме зробив, " +
  "і переведи її в статус review. " +
  "Якщо задача незрозуміла і ти не знаєш, що саме зробити, " +
  "нічого не вигадуй: напиши в коментарі конкретне питання " +
  "і поверни задачу в статус todo. Коротко, українською.";

await runAgent(task, toolList, instructions);
