// Підключаємось до сервера трекера
const trackerServer = await mcp.connect("tracker");

// Питаємо, які в нього інструменти (це запит tools/list)
const toolDefs = await trackerServer.listTools();
console.log(toolDefs.map((tool) => tool.name));

// Як сервер описав статуси в інструменті update?
const update = toolDefs.find((tool) => tool.name === "update");
console.log(update.input_schema.properties.status);

// Просимо сервер виконати інструмент get (це запит tools/call)
const task = await trackerServer.callTool("get", { id: "T-6" });
console.log(task);
