// Інструменти для файлів робочої папки: list_files, read_file, write_file.
// Спільні для всіх уроків. У кожного: def — опис для моделі, run — що справді робить.
// Перевірок шляху тут навмисно НЕМАЄ: в уроці 1 (крок 8) їх дописують самі.
const stringParam = { type: "string" };

export function createFileTools(workspace, report) {
  return {
    list_files: {
      // Як Glob у Claude Code: усі файли з підпапками і повними шляхами.
      // Маленькі моделі самі в підпапки не зазирають.
      def: {
        name: "list_files",
        description:
          "List all files in a workspace folder, including subfolders, with their paths. Use '.' for the whole workspace.",
        input_schema: { type: "object", properties: { dir: stringParam }, required: ["dir"] },
      },
      run: async ({ dir }) => {
        const folder = workspace.resolve(dir);
        const output = workspace.list(folder).join("\n") || "(порожньо)";
        report({
          type: "tool",
          name: "list_files",
          input: { dir },
          output,
          ok: true,
          escaped: !workspace.isInside(folder),
        });
        return output;
      },
    },

    read_file: {
      def: {
        name: "read_file",
        description: "Read a text file from the workspace.",
        input_schema: { type: "object", properties: { path: stringParam }, required: ["path"] },
      },
      run: async ({ path }) => {
        const fullPath = workspace.resolve(path);
        if (!workspace.has(fullPath)) {
          const output = `файл не знайдено: ${path}`;
          report({ type: "tool", name: "read_file", input: { path }, output, ok: false });
          throw new Error(output);
        }
        const output = workspace.read(fullPath);
        report({
          type: "tool",
          name: "read_file",
          input: { path },
          output,
          ok: true,
          escaped: !workspace.isInside(fullPath),
        });
        return output;
      },
    },

    write_file: {
      def: {
        name: "write_file",
        description: "Create or overwrite a text file in the workspace.",
        input_schema: {
          type: "object",
          properties: { path: stringParam, contents: stringParam },
          required: ["path", "contents"],
        },
      },
      run: async ({ path, contents }) => {
        const fullPath = workspace.resolve(path);
        workspace.write(fullPath, contents);
        report({
          type: "tool",
          name: "write_file",
          input: { path, contents },
          output: `записано ${fullPath}`,
          ok: true,
          escaped: !workspace.isInside(fullPath),
        });
        return `записано ${String(contents).length} символів у ${path}`;
      },
    },
  };
}

// Як прохання до файлових інструментів звучить людською мовою (для кадрів блоку «Що сталося»)
export function describeFileRequest(name, input = {}, esc) {
  if (name === "list_files") return `«Покажи, які файли є в папці <code>${esc(input.dir ?? ".")}</code>»`;
  if (name === "read_file") return `«Прочитай файл <code>${esc(input.path)}</code>»`;
  if (name === "write_file") return `«Запиши файл <code>${esc(input.path)}</code>»`;
  return null; // нехай сторінка скаже загальне «Натисни …»
}
