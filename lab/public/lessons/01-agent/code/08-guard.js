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
    content: "Запиши в notes/shopping.md: купити молоко і хліб",
  },
];
const toolList = [
  tools.list_files.def,
  tools.read_file.def,
  tools.write_file.def,
];

// Щонайбільше 5 спроб, як у кроці 7
for (let turn = 1; turn <= 5; turn++) {
  const reply = await model({ messages, tools: toolList });
  messages.push({ role: "assistant", content: reply.content });

  // Модель нічого не просить — значить, вона вже відповіла. Виходимо
  const requests = getRequests(reply);
  if (requests.length === 0) break;

  const results = await runTools(requests);
  messages.push({ role: "user", content: results });
}
