const messages = [
  {
    role: "user",
    content: "Які в мене задачі? Вони записані у файлі з нотатками.",
  },
];
const toolList = [tools.list_files.def, tools.read_file.def];

const reply = await model({ messages, tools: toolList });

// Модель могла і щось написати, і попросити запустити інструмент.
// Нам потрібні тільки прохання
const requests = reply.content.filter((part) => part.type === "tool_use");

// Запускаємо кожен інструмент, який вона попросила, — самі, своїм кодом
for (const request of requests) {
  const result = await tools[request.name].run(request.input);
  console.log(result);
}
