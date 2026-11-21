// Маленька імітація MCP для уроків 3 і далі.
// MCP — домовленість, як сервіс віддає агенту свої інструменти. У ній дві головні дії:
//   tools/list — «які в тебе інструменти?»: сервер відповідає описами (name, description, input_schema);
//   tools/call — «виконай ось цей з такими параметрами»: сервер виконує і повертає результат.
// Справжній MCP-сервер — окрема програма, і код агента говорить з нею через stdin/stdout або HTTP.
// Тут сервери живуть у тій самій пісочниці, але код агента так само знає про них тільки те, що вони скажуть.

/**
 * @param servers { git: { tools: { branch: { def, run }, … } }, tracker: { … } }
 * @param report  куди повідомляти, що відбувається (для кадрів блоку «Що сталося»)
 */
export function createMcp(servers, report) {
  const said = (title, output, why) =>
    report({ type: "tool", byCode: true, name: "mcp", title, output, why, ok: true });

  return {
    // Підключитись до сервера за назвою. У Claude Code це робить `claude mcp add` і файл .mcp.json
    async connect(serverName) {
      const server = servers[serverName];
      if (!server) throw new Error(`сервера ${serverName} немає, є: ${Object.keys(servers).join(", ")}`);

      return {
        name: serverName,

        // tools/list
        async listTools() {
          const defs = Object.values(server.tools).map((tool) => structuredClone(tool.def));
          said(
            `Код питає сервер ${serverName}: які в тебе інструменти?`,
            defs.map((def) => `${def.name} — ${def.description}`).join("\n"),
            "Це запит tools/list. Сервер сам розповідає, що вміє: назви, описи й параметри. Код агента заздалегідь їх не знав.",
          );
          return defs;
        },

        // tools/call
        async callTool(toolName, input = {}) {
          const tool = server.tools[toolName];
          if (!tool) {
            const message = `у сервера ${serverName} немає інструмента ${toolName}`;
            report({ type: "tool", server: serverName, name: toolName, input, output: message, ok: false });
            throw new Error(message);
          }
          try {
            const output = await tool.run(input);
            report({ type: "tool", server: serverName, name: toolName, input, output, ok: true });
            return output;
          } catch (error) {
            report({
              type: "tool",
              server: serverName,
              name: toolName,
              input,
              output: error.message,
              ok: false,
            });
            throw error;
          }
        },
      };
    },
  };
}
