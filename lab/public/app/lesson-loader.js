// Готує урок до показу: підвантажує lesson.js, код кожного кроку з папки code/
// і пісочницю (sandbox.js), щоб сторінка могла описувати прохання моделі людською мовою.

// Версія сайту з адреси цього модуля (?v=<коміт>, див. scripts/stamp-version.mjs).
// Додаємо її до всього, що вантажимо самі, щоб браузер не брав старе з кешу
const VERSION = new URL(import.meta.url).search;

export async function loadLesson(entry) {
  const base = new URL(`../lessons/${entry.folder}/`, import.meta.url);
  const { default: lesson } = await import(new URL(`lesson.js${VERSION}`, base));
  const sandboxUrl = new URL(`sandbox.js${VERSION}`, base).href;
  const sandbox = await import(sandboxUrl);

  const readCode = async (file) => {
    if (!file) return undefined;
    const response = await fetch(new URL(`${file}${VERSION}`, base));
    if (!response.ok) throw new Error(`Не вдалося завантажити ${file} (${response.status})`);
    return response.text();
  };

  const steps = await Promise.all(
    lesson.steps.map(async (step) => ({
      ...step,
      source: await readCode(step.code),
      fixSource: await readCode(step.fix),
    })),
  );

  return { ...lesson, id: entry.id, steps, sandboxUrl, describe: sandbox.describeRequest };
}
