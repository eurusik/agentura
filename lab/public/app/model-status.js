// Хто відповідає за модель: заготовка (завжди є) або справжня модель, яку ти підключив (необов'язково).
import { esc } from "./util.js";

// Що сервер знає про підключену модель: { ready, label, model, free, problem }
export const realModel = { ready: false };

export async function loadModelStatus() {
  try {
    const status = await (await fetch("/api/status")).json();
    Object.keys(realModel).forEach((key) => delete realModel[key]);
    Object.assign(realModel, status);
  } catch {
    realModel.ready = false;
  }
}

export const STUB_HINT =
  "Зараз відповідає заготовка: відповіді моделі записані наперед, як мок у тестах. Так видно, що робить <b>код</b>, і нічого не треба платити.";

export function realModelHint() {
  if (realModel.ready) {
    const price = realModel.free ? " · безкоштовно" : " · платно, частки цента за запуск";
    return `Відповідає <b>${esc(realModel.label)}</b> · <code>${esc(realModel.model)}</code>${price}. Код той самий, що й для заготовки. Справжня модель іноді помиляється, особливо маленька, і це нормально: саме для таких випадків у коді є запобіжники.`;
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
