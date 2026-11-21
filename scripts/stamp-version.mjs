// Під час деплою дописує версію (?v=<коміт>) до адрес наших модулів, скриптів і стилів.
// Навіщо: GitHub Pages дозволяє браузеру тримати файли в кеші 10 хвилин, і модулі, завантажені
// через import(), браузер не оновлює навіть після перезавантаження сторінки. Після деплою
// людина могла отримати новий урок разом зі старим runtime і побачити помилку.
// З версією в адресі кожен деплой — нові адреси, і кеш їм не заважає.
//
//   node scripts/stamp-version.mjs lab/public <версія>
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";

const [root, version] = process.argv.slice(2);
if (!root || !version) {
  console.error("як запускати: node scripts/stamp-version.mjs <папка> <версія>");
  process.exit(1);
}
const v = `?v=${version}`;

// import … from "./x.js" і "} from "./x.js"" на початку рядка — тільки відносні адреси наших файлів.
// Саме на початку рядка: так не зачепимо текст усередині рядків, наприклад вміст віртуальних файлів
const JS_IMPORT = /^(\s*(?:import\b.*?\bfrom|\}\s*from|import)\s*)(["'])(\.{1,2}\/[^"'?]+\.js)\2/gm;
// <script src="x.js">, <link href="style.css"> — тільки свої файли, не https: і не data:
const HTML_ASSET = /\b(src|href)="(?![a-z]+:|\/\/)([^"?]+\.(?:js|css))"/g;

let changed = 0;
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = path.relative(root, full);
    // vendor — зібраний редактор; code/ — код кроків, який учень бачить у редакторі, не модулі
    if (rel === "vendor" || /(^|\/)code$/.test(rel)) continue;
    if (statSync(full).isDirectory()) {
      walk(full);
      continue;
    }
    if (!/\.(js|html)$/.test(name)) continue;
    const before = readFileSync(full, "utf8");
    let after = before.replace(JS_IMPORT, `$1$2$3${v}$2`);
    if (name.endsWith(".html")) after = after.replace(HTML_ASSET, `$1="$2${v}"`);
    if (after !== before) {
      writeFileSync(full, after);
      changed++;
    }
  }
}
walk(root);
console.log(`версію ${version} дописано у ${changed} файлів`);
