// Маленька імітація MCP (Model Context Protocol) для уроку 4 і далі.
// MCP — домовленість, як сервіс віддає агенту свої інструменти. Головних запитів два:
//   tools/list — «які в тебе інструменти?»: сервер відповідає описами (name, description, input_schema);
//   tools/call — «виконай ось цей з такими параметрами»: сервер виконує і повертає результат.
// Справжній MCP-сервер — окрема програма, і агент говорить з нею повідомленнями JSON-RPC
// (через stdin/stdout або HTTP). Тут сервери живуть у тій самій пісочниці, але код агента так само
// знає про них тільки те, що вони скажуть. Самі повідомлення JSON-RPC ми показуємо в кадрах.

/**
 * @param servers { git: { tools: { branch: { def, run }, … } }, tracker: { … } }
 * @param report  куди повідомляти, що відбувається (для кадрів блоку «Що сталося»)
 */
export function createMcp(servers, report) {
  let nextId = 0;
  // Пара повідомлень JSON-RPC: що надіслав агент і що відповів сервер
  const rpc = (method, params, result) => {
    const id = ++nextId;
    const request = { jsonrpc: "2.0", id, method, ...(params ? { params } : {}) };
    return { request, response: { jsonrpc: "2.0", id, result } };
  };
  const said = (title, output, why, messages) =>
    report({ type: "tool", byCode: true, name: "mcp", title, output, why, ok: true, rpc: messages });

  return {
    // Зареєструвати свій сервер (крок 6 уроку 4). Справжній запускають окремою програмою
    serve(serverName, tools) {
      servers[serverName] = { tools };
      said(
        `Код запускає свій сервер ${serverName}`,
        Object.keys(tools).join("\n"),
        "Тепер у лабораторії є ще один MCP-сервер. Підключатись до нього будемо так само, як до чужих.",
      );
    },

    // Підключитись до сервера за назвою. У Claude Code це робить `claude mcp add` або файл .mcp.json
    async connect(serverName) {
      const server = servers[serverName];
      if (!server) throw new Error(`сервера ${serverName} немає, є: ${Object.keys(servers).join(", ")}`);
      said(
        `Код підключається до сервера ${serverName}`,
        `підключено: ${serverName}`,
        "Спершу агент і сервер вітаються (запит initialize) і домовляються, якою версією MCP говорять.",
        rpc(
          "initialize",
          { protocolVersion: "2025-06-18", clientInfo: { name: "agentura-lab" } },
          { protocolVersion: "2025-06-18", serverInfo: { name: serverName }, capabilities: { tools: {} } },
        ),
      );

      return {
        name: serverName,

        // tools/list
        async listTools() {
          const defs = Object.values(server.tools).map((tool) => structuredClone(tool.def));
          const tools = defs.map((def) => ({
            name: def.name,
            description: def.description,
            inputSchema: def.input_schema,
          }));
          said(
            `Код питає сервер ${serverName}: які в тебе інструменти?`,
            defs.map((def) => `${def.name} — ${def.description}`).join("\n"),
            "Це запит tools/list. Сервер сам розповідає, що вміє: назви, описи й параметри. Код агента заздалегідь їх не знав.",
            rpc("tools/list", null, { tools }),
          );
          return defs;
        },

        // tools/call
        async callTool(toolName, input = {}) {
          const tool = server.tools[toolName];
          const call = (output, ok) =>
            report({
              type: "tool",
              server: serverName,
              name: toolName,
              input,
              output,
              ok,
              // Якщо інструмент не спрацював, сервер так і каже: isError: true
              rpc: rpc(
                "tools/call",
                { name: toolName, arguments: input },
                { content: [{ type: "text", text: output }], ...(ok ? {} : { isError: true }) },
              ),
            });
          if (!tool) {
            const message = `у сервера ${serverName} немає інструмента ${toolName}`;
            call(message, false);
            throw new Error(message);
          }
          try {
            const output = String(await tool.run(input));
            call(output, true);
            return output;
          } catch (error) {
            call(error.message, false);
            throw error;
          }
        },
      };
    },
  };
}
