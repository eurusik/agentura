// Віртуальна «робоча папка» агента. Живе в пам'яті браузера — справжній диск ніхто не чіпає.
// Спільна для всіх уроків; які файли в ній лежать на старті, вирішує пісочниця уроку.

export const WORK = "/work";

// Перетворює шлях на справжню адресу: прибирає «.» і «..».
//   resolvePath("/work", "notes/../x") → "/work/x"
//   resolvePath("/work", "../../x")    → "/x"   (тобто назовні!)
export function resolvePath(base, path) {
  const start = String(path).startsWith("/") ? [] : base.split("/");
  const result = [];
  for (const part of start.concat(String(path).split("/"))) {
    if (!part || part === ".") continue;
    if (part === "..") result.pop();
    else result.push(part);
  }
  return "/" + result.join("/");
}

/**
 * @param initialFiles { "notes/todo.md": "…" } — шляхи відносно /work
 * @param report       куди повідомляти сторінку про зміни файлів
 */
export function createWorkspace(initialFiles, report) {
  const files = new Map(Object.entries(initialFiles).map(([path, text]) => [`${WORK}/${path}`, text]));

  const workspace = {
    // Повна адреса для шляху, який дала модель
    resolve: (path) => resolvePath(WORK, path ?? "."),
    isInside: (fullPath) => fullPath === WORK || fullPath.startsWith(WORK + "/"),
    has: (fullPath) => files.has(fullPath),
    read: (fullPath) => files.get(fullPath),
    write(fullPath, text) {
      files.set(fullPath, String(text));
      workspace.reportFiles();
    },
    // Усі файли в папці (з підпапками), шляхи — відносно цієї папки
    list(folder) {
      return [...files.keys()]
        .filter((file) => file.startsWith(folder + "/"))
        .map((file) => file.slice(folder.length + 1))
        .sort();
    },
    reportFiles: () => report({ type: "fs", files: [...files.keys()].sort() }),
  };
  return workspace;
}
