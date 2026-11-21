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

// Код бере задачу T-6 і забирає її собі (урок 2)
const task = tracker.get("T-6");
tracker.update(task.id, { status: "in_progress", assignee: "агент" });

// Як лабораторія описала моделі статуси в інструменті update_task?
console.log(tools.update_task.def.input_schema.properties.status);

// Як у кінці уроку 3, тільки без git: для цієї задачі він не потрібен
const toolList = [
  tools.read_file.def,
  tools.write_file.def,
  tools.add_comment.def,
  tools.update_task.def,
];
const instructions =
  "Ти агент-розробник і виконуєш задачі з трекера. " +
  "Перш ніж змінити файл, прочитай його. " +
  "Коли закінчиш, напиши в задачі коментар, що зробив. " +
  "Якщо задачу зробити не можна, переведи її в статус blocked " +
  "і напиши в коментарі чому. Коротко, українською.";

await runAgent(task, toolList, instructions);
