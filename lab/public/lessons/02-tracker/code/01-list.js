// Дістає з відповіді моделі її прохання запустити інструмент (з уроку 1)
function getRequests(reply) {
  return reply.content.filter((part) => part.type === "tool_use");
}

// Запускає інструменти і повертає, що вони видали (з уроку 1)
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

const messages = [
  {
    role: "user",
    content: "Які задачі в трекері чекають на агента? У них мітка agent.",
  },
];

// Інструменти трекера: список задач і одна задача за номером
const toolList = [tools.list_tasks.def, tools.get_task.def];

// Той самий цикл агента, що в уроці 1
for (let turn = 1; turn <= 5; turn++) {
  const reply = await model({ messages, tools: toolList });
  messages.push({ role: "assistant", content: reply.content });

  // Модель нічого не просить — значить, вона вже відповіла. Виходимо
  const requests = getRequests(reply);
  if (requests.length === 0) break;

  const results = await runTools(requests);
  messages.push({ role: "user", content: results });
}
