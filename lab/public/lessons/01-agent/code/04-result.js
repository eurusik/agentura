const messages = [
  {
    role: "user",
    content: "Які в мене задачі? Вони записані у файлі з нотатками.",
  },
];
const toolList = [tools.list_files.def, tools.read_file.def];

const reply = await model({ messages, tools: toolList });

// Дописуємо в розмову відповідь моделі —
// інакше наступного разу вона не згадає, що щось просила
messages.push({ role: "assistant", content: reply.content });

// Запускаємо інструменти, які вона попросила, і збираємо, що вони повернули
const requests = reply.content.filter((part) => part.type === "tool_use");
const results = [];
for (const request of requests) {
  const result = await tools[request.name].run(request.input);
  results.push({
    type: "tool_result",
    tool_use_id: request.id,
    content: result,
  });
}

// Дописуємо результати в розмову і питаємо модель ще раз
messages.push({ role: "user", content: results });
await model({ messages, tools: toolList });
