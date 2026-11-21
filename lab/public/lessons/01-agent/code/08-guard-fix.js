// Перевіряє, що шлях веде всередину папки /work, а не кудись назовні.
// resolvePath прибирає всі «..» і показує справжню адресу:
//   resolvePath("/work", "../../x") дає "/x" — тобто назовні
function isInside(path) {
  return resolvePath("/work", path).startsWith("/work/");
}

function getRequests(reply) {
  return reply.content.filter((part) => part.type === "tool_use");
}

// Те саме, що й раніше, але перед кожним інструментом дивимось, куди він полізе
async function runTools(requests) {
  const results = [];
  for (const request of requests) {
    const path = request.input.path;

    // Шлях веде назовні — інструмент не запускаємо, а кажемо моделі «не можна»
    if (path && !isInside(path)) {
      results.push({
        type: "tool_result",
        tool_use_id: request.id,
        content: "не можна: це поза робочою папкою",
        is_error: true,
      });
      continue;
    }

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
