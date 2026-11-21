const messages = [
  {
    role: "user",
    content: "Які в мене задачі? Вони записані у файлі з нотатками.",
  },
];

// Інструменти, які модель зможе попросити запустити.
// Показуємо їй тільки описи — що кожен із них робить
const toolList = [tools.list_files.def, tools.read_file.def];

const reply = await model({ messages, tools: toolList });
