// Хто відповідає за модель: заготовка (завжди є) або справжня модель, яку ти підключив (необов'язково).
import { esc } from "./util.js";

// Що сервер знає про підключену модель: { ready, label, model, free, problem }.
// noServer: true — сторінку відкрито як сайт (наприклад, на GitHub Pages), сервера лабораторії немає,
// тож працює тільки заготовка.
export const realModel = { ready: false };

export async function loadModelStatus() {
  Object.keys(realModel).forEach((key) => delete realModel[key]);
  // На GitHub Pages сервера лабораторії точно немає — не питаємо, щоб не сипати 404 у консоль
  if (location.hostname.endsWith("github.io")) {
    Object.assign(realModel, { ready: false, noServer: true });
    return;
  }
  try {
    const response = await fetch("/api/status");
    if (!response.ok) throw new Error(`status ${response.status}`);
    Object.assign(realModel, await response.json());
  } catch {
    Object.assign(realModel, { ready: false, noServer: true });
  }
}

export const REPO_URL = "https://github.com/eurusik/agentura";

// Як запустити лабораторію у себе — показуємо на онлайн-версії
export const RUN_LOCALLY = `
  <pre class="cmds">git clone ${REPO_URL}.git
cd agentura
npm install
npm run lab</pre>
  <p>Потім відкрий <code>http://localhost:4321</code>. Детальніше — у <a href="${REPO_URL}#readme" target="_blank" rel="noopener">README</a>.</p>`;

export const STUB_HINT =
  "Зараз відповідає заготовка: відповіді моделі записані наперед, як мок у тестах. Так видно, що робить <b>код</b>, і нічого не треба платити.";

export function realModelHint() {
  if (realModel.ready) {
    const price = realModel.free ? " · безкоштовно" : " · платно, частки цента за запуск";
    return `Відповідає <b>${esc(realModel.label)}</b> · <code>${esc(realModel.model)}</code>${price}. Код той самий, що й для заготовки. Справжня модель іноді помиляється, особливо маленька, і це нормально: саме для таких випадків у коді є запобіжники.`;
  }
  if (realModel.noServer) {
    return `<b>Це онлайн-версія, тут працює тільки заготовка.</b> Справжню модель підключає сервер лабораторії: він тримає ключі і ходить до Ollama чи API. Тому для живої моделі лабораторію треба запустити у себе, це чотири команди:
      ${RUN_LOCALLY}`;
  }
  const problem = realModel.problem ? `<p class="warn">${esc(realModel.problem)}</p>` : "";
  return `<b>Справжня модель не підключена.</b> Це необов'язково, усі кроки працюють і на заготовці. Якщо хочеш спробувати, є три варіанти:
    ${problem}
    <ol class="setup">
      <li><b>Ollama, локально і безкоштовно.</b> Постав програму з <code>ollama.com</code> і виконай у терміналі <code>ollama pull qwen3:8b</code> (близько 5 ГБ). Лабораторія знайде модель сама.</li>
      <li><b>Хмарний API з безкоштовним лімітом:</b> OpenRouter, Groq або Gemini. Візьми ключ на сайті сервісу, скопіюй <code>.env.example</code> у <code>.env</code>, заповни три рядки <code>OPENAI_…</code> і перезапусти <code>npm run lab</code>.</li>
      <li><b>Claude від Anthropic</b>, платно: допиши <code>ANTHROPIC_API_KEY</code> у <code>.env</code>.</li>
    </ol>
    <p><button class="recheck">Перевірити ще раз</button> <a class="setup-link" href="setup.html" target="_blank">Покрокова інструкція →</a></p>`;
}
