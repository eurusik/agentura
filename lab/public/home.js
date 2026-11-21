// Головна сторінка: назва курсу і список уроків зі статусами.
import { COURSE, LESSONS, doneLessons } from "./lessons/index.js";
import { esc } from "./app/util.js";
import { loadModelStatus, realModel } from "./app/model-status.js";

const home = document.getElementById("home");
const done = doneLessons();

function statusChip(lesson) {
  if (lesson.status !== "ready") return `<span class="chip soon">Скоро</span>`;
  if (done.has(lesson.id)) return `<span class="chip done">Пройдено</span>`;
  return `<span class="chip ready">Готовий</span>`;
}

function lessonRow(lesson) {
  const inner = `
    <span class="lesson-num">${lesson.id}</span>
    <span class="lesson-body">
      <span class="lesson-title">${esc(lesson.title)}</span>
      <span class="lesson-about">${esc(lesson.about)}</span>
    </span>
    ${statusChip(lesson)}`;
  return lesson.status === "ready"
    ? `<li><a class="lesson-row" href="lesson.html?l=${lesson.id}">${inner}</a></li>`
    : `<li><div class="lesson-row is-soon" aria-disabled="true">${inner}</div></li>`;
}

function modelLine() {
  if (realModel.ready) {
    return `Справжня модель підключена: <b>${esc(realModel.label)}</b> · <code>${esc(realModel.model)}</code>. <a href="setup.html">Підключити іншу</a>`;
  }
  return 'Справжня модель не підключена. Це необов\'язково: усі уроки працюють на заготовлених відповідях. <a href="setup.html">Як підключити свою модель</a>';
}

async function render() {
  await loadModelStatus();
  const ready = LESSONS.filter((lesson) => lesson.status === "ready").length;
  home.innerHTML = `
    <h1>${esc(COURSE.title)}</h1>
    <p class="goal">${esc(COURSE.intro)}</p>
    <p class="muted small">Готово ${ready} з ${LESSONS.length} уроків · ${modelLine()}</p>
    <ol class="lessons">${LESSONS.map(lessonRow).join("")}</ol>`;
}

render();
