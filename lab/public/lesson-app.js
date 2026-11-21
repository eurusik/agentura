// Сторінка уроку: lesson.html?l=1. Заголовок, смужка прогресу, кроки по черзі і тест у кінці.
// Самі частини лежать у папці app/: editor, frames, player, step, model-status, lesson-loader.
import { LESSONS, markDone } from "./lessons/index.js";
import { esc } from "./app/util.js";
import { loadModelStatus, realModel } from "./app/model-status.js";
import { loadLesson } from "./app/lesson-loader.js";
import { renderStep } from "./app/step.js";

const flow = document.getElementById("flow");
const progress = document.getElementById("progress");
const backLink = `<a class="back" href="./">← Усі уроки</a>`;

const GIVEN = `
  <details class="given">
    <summary>Що дає лабораторія: звідки в коді беруться <code>model</code>, <code>tools</code>, <code>resolvePath</code></summary>
    <p>Код у кроках — це не цілий проєкт, а тільки серцевина агента. Кілька речей лабораторія дає готовими, імпортувати їх не треба:</p>
    <dl>
      <dt><code>model({ system, messages, tools })</code></dt>
      <dd>Відправляє моделі розмову, список інструментів і, якщо треба, інструкцію. Повертає відповідь моделі. Хто саме відповідає, заготовка чи справжня модель, вибираєш під кодом. У своєму проєкті тут був би запит до API.</dd>
      <dt><code>tools</code></dt>
      <dd>Інструменти уроку. У кожного є <code>.def</code>, опис для моделі, і <code>.run(input)</code>, функція, яка робить дію. Файли лежать у віртуальній папці <code>/work</code> прямо в браузері.</dd>
      <dt><code>resolvePath(base, path)</code></dt>
      <dd>Прибирає <code>..</code> зі шляху і показує, куди він веде насправді.</dd>
      <dt><code>console.log(...)</code></dt>
      <dd>Показує текст у блоці «Що сталося» під кодом.</dd>
    </dl>
    <p>Решту, тобто розмову, цикл і перевірки, ми пишемо самі. Про це і є урок.</p>
  </details>`;

function showMessage(title, text) {
  flow.innerHTML = `${backLink}<h1>${title}</h1><p>${text}</p>`;
}

async function start() {
  const id = Number(new URLSearchParams(location.search).get("l") ?? 1);
  const entry = LESSONS.find((lesson) => lesson.id === id);
  if (!entry) return showMessage("Урок не знайдено", `Уроку з номером ${esc(id)} немає.`);
  if (entry.status !== "ready")
    return showMessage(
      "Урок у роботі",
      `Урок ${id} «${esc(entry.title)}» ще готується. Повернись трохи згодом.`,
    );

  const [lesson] = await Promise.all([loadLesson(entry), loadModelStatus()]);
  document.title = `${lesson.title} — Агентура`;

  flow.innerHTML = `
    ${backLink}
    <h1>${esc(lesson.title)}</h1>
    <p class="goal">${esc(lesson.goal)}</p>
    <p class="muted">Кожен крок влаштований однаково. Спершу трохи тексту, потім код (нові рядки підсвічено <span class="legend-new"><i></i></span>). Натискаєш <b>▶ Запустити</b>, і під кодом з'являється блок «Що сталося», його можна гортати по одному кадру (<kbd>←</kbd> <kbd>→</kbd>). Код можна змінювати і запускати скільки завгодно. Він виконується прямо в браузері, а файли, з якими працює агент, віртуальні, тож справжній диск він не зачепить.</p>
    ${GIVEN}`;

  // Смужка прогресу вгорі: по одній рисці на крок + одна на тест
  progress.innerHTML = "<span></span>".repeat(lesson.steps.length + 1);
  const setProgress = (current) =>
    [...progress.children].forEach((dash, k) => {
      dash.className = k < current ? "done" : k === current ? "cur" : "";
    });

  // Кроки відкриваються по одному
  function openStep(index) {
    const isLast = index + 1 >= lesson.steps.length;
    const section = renderStep(lesson, index, flow, () => (isLast ? openQuiz() : openStep(index + 1)));
    setProgress(index);
    if (index > 0) section.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openQuiz() {
    setProgress(lesson.steps.length);
    markDone(lesson.id);
    flow.appendChild(renderQuiz(lesson));
    flow.lastElementChild.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  openStep(0);
}

function renderQuiz(lesson) {
  const section = document.createElement("section");
  section.className = "step quiz";
  section.innerHTML = `<div class="num">Фінал</div><h2>Перевір себе</h2>`;

  for (const question of lesson.quiz) {
    const block = document.createElement("div");
    block.className = "q";
    block.innerHTML = `<p><b>${esc(question.q)}</b></p>`;
    question.options.forEach((option, k) => {
      const button = document.createElement("button");
      button.textContent = option;
      button.onclick = () => {
        button.classList.add(k === question.answer ? "ok" : "no");
        if (!block.querySelector(".why")) {
          block.insertAdjacentHTML("beforeend", `<p class="why muted">${esc(question.why)}</p>`);
        }
      };
      block.appendChild(button);
    });
    section.appendChild(block);
  }

  const tryReal = realModel.ready
    ? "Тепер спробуй пройти кроки зі <b>«Справжньою моделлю»</b>: той самий код керуватиме нею."
    : "Якщо захочеш, підключи свою модель (кнопка «Справжня модель» підкаже як) і пройди кроки ще раз. Той самий код керуватиме вже нею.";
  const next = LESSONS.find((entry) => entry.id === lesson.id + 1);
  const nextLink = !next
    ? `<a class="next" href="./"><span class="next-l">Курс пройдено</span><span class="next-t">До всіх уроків →</span></a>`
    : next.status === "ready"
      ? `<a class="next" href="lesson.html?l=${next.id}"><span class="next-l">Наступний урок ${next.id}</span><span class="next-t">${esc(next.title)} →</span></a>`
      : `<a class="next" href="./"><span class="next-l">Наступний урок ${next.id} «${esc(next.title)}» — скоро</span><span class="next-t">До всіх уроків →</span></a>`;

  section.insertAdjacentHTML("beforeend", `<p>Урок пройдено. ${tryReal}</p>${nextLink}`);
  return section;
}

start().catch((error) => showMessage("Щось пішло не так", `Не вдалося відкрити урок: ${esc(error.message)}`));
