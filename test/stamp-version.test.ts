// Скрипт, який під час деплою дописує версію до адрес модулів
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

test("stamp-version: версія в імпортах і тегах, але не всередині рядків і не в коді кроків", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "stamp-"));
  mkdirSync(path.join(dir, "lessons/x/code"), { recursive: true });
  writeFileSync(
    path.join(dir, "a.js"),
    [
      'import { b } from "./b.js";',
      "import {",
      "  c,",
      '} from "../c.js";',
      "const file = 'import { title } from \"./config.js\";';",
      'import cm from "https://cdn.example/cm.js";',
    ].join("\n"),
  );
  writeFileSync(
    path.join(dir, "page.html"),
    '<link rel="stylesheet" href="style.css" /><link href="https://fonts.x/a.css" /><script type="module" src="app.js"></script>',
  );
  writeFileSync(path.join(dir, "lessons/x/code/01.js"), 'import { b } from "./b.js";');

  execFileSync("node", ["scripts/stamp-version.mjs", dir, "abc"]);

  const js = readFileSync(path.join(dir, "a.js"), "utf8");
  assert.match(js, /from "\.\/b\.js\?v=abc"/);
  assert.match(js, /\} from "\.\.\/c\.js\?v=abc"/);
  assert.match(js, /from "\.\/config\.js";'/, "текст усередині рядка не чіпаємо");
  assert.match(js, /cdn\.example\/cm\.js"/, "чужі адреси не чіпаємо");

  const html = readFileSync(path.join(dir, "page.html"), "utf8");
  assert.match(html, /href="style\.css\?v=abc"/);
  assert.match(html, /src="app\.js\?v=abc"/);
  assert.match(html, /href="https:\/\/fonts\.x\/a\.css"/);

  assert.equal(readFileSync(path.join(dir, "lessons/x/code/01.js"), "utf8"), 'import { b } from "./b.js";');
});
