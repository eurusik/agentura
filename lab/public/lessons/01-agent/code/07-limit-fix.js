// Дістає з відповіді моделі її прохання запустити інструмент (як у кроці 3)
function getRequests(reply) {
  return reply.content.filter((part) => part.type === "tool_use");
}

// Запускає інструменти і повертає, що вони видали (як у кроці 4)
async function runTools(requests) {
  const results = [];
  for (const request of requests) {
    const result = await tools[request.name].run(request.input);
    results.push({
      type: "tool_result",
      tool_use_id: request.id,
      content: result,
    });
  }
  return results;
}

const messages = [
  {
    role: "user",
    content: "Які в мене задачі? Вони записані у файлі з нотатками.",
  },
];
const toolList = [tools.list_files.def, tools.read_file.def];

// Даємо агенту щонайбільше 5 спроб. Якщо модель заплуталась
// і просить одне й те саме, на п'ятій спробі ми просто зупинимось —
// а не крутитимемось (і платитимемо) вічно
const maxTurns = 5;

// turn — номер спроби: 1, 2, 3, 4, 5
for (let turn = 1; turn <= maxTurns; turn++) {
  const reply = await model({ messages, tools: toolList });
  messages.push({ role: "assistant", content: reply.content });

  // Модель нічого не просить — значить, вона вже відповіла. Виходимо
  const requests = getRequests(reply);
  if (requests.length === 0) break;

  const results = await runTools(requests);
  messages.push({ role: "user", content: results });
}
