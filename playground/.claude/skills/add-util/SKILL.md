---
name: add-util
description: Add a new utility function to this library with its test. Use when asked to add, create or implement a utility/helper function.
---

# Додати утиліту

1. Подивись `src/price.js` і `test/price.test.js` як зразок стилю.
2. Створи `src/<name>.js`: один іменований експорт, JSDoc з `@param` і `@returns`, валідація входу через `TypeError`.
3. Створи `test/<name>.test.js` з трьома тестами: звичайний випадок, крайній випадок, некоректний вхід.
4. Запусти `npm test`. Якщо щось впало — виправ код (не тест) і запусти ще раз.
5. Відповідь: список створених файлів і останні рядки виводу `npm test` (`# pass` / `# fail`).
