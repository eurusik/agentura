// Один крок уроку: текст → редактор → вибір моделі → «Запустити» → блок «Що сталося» → «Покрути» / наступний крок.
import { esc, timesCount } from "./util.js";
import { createEditor, replaceEditor, newLines } from "./editor.js";
import { framesFor } from "./frames.js";
import { createPlayer } from "./player.js";
import { realModel, loadModelStatus, STUB_HINT, realModelHint } from "./model-status.js";
import { STATE_EVENTS, drawPanels } from "./panels.js";
import { createAgentFolder } from "./agent-fold.js";

// Браузер довго тримає скрипт воркера в кеші, навіть після перезавантаження сторінки.
// Коли міняєш runtime/worker.js, збільш це число, щоб усі отримали нову версію.
const WORKER_VERSION = 3;

/**
 * @param lesson урок, підготовлений loadLesson(): кроки з уже завантаженим кодом (source, fixSource),
 *               адреса пісочниці (sandboxUrl) і опис прохань (describe)
 * @param index  номер цього кроку (з нуля)
 * @param parent куди вставити крок
 * @param onNext що робити, коли учень тисне «Наступний крок»
 */
export function renderStep(lesson, index, parent, onNext) {
  const steps = lesson.steps;
  const step = steps[index];
  const section = document.createElement("section");
  section.className = "step";
  section.innerHTML = `
    <div class="num">Крок ${index + 1} / ${steps.length}</div>
    <h2>${esc(step.title)}</h2>
    <div class="text">${step.text}</div>
    <div class="editor"></div>
    <div class="modebar">
      <span class="seg-l">Хто відповідає за модель</span>
      <span class="seg" role="group">
        <button data-mode="stub" class="on">${step.stubLabel ?? "Заготовка"}</button>
        <button data-mode="real"></button>
      </span>
    </div>
    <div class="modehint muted"></div>
    <div class="bar">
      <button class="primary run">▶ Запустити</button>
      <button class="stop" hidden>■ Стоп</button>
      <button class="reset">↺ Повернути код</button>
    </div>
    <div class="out"></div>`;
  parent.appendChild(section);

  const out = section.querySelector(".out");
  const runButton = section.querySelector(".run");
  const stopButton = section.querySelector(".stop");

  // Стан кроку
  let code = step.source;
  let freshLines =
    index > 0 ? newLines(steps[index - 1].fixSource ?? steps[index - 1].source, step.source) : new Set();
  let editor = createEditor(section.querySelector(".editor"), code, freshLines, () => run());
  let mode = "stub"; // "stub" — заготовка, "real" — справжня модель
  let fixed = false; // учень натиснув «Застосувати виправлення»
  let shownAfterRun = false; // блок «Покрути» / виправлення вже показали
  let worker = null;
  let timeout = null;
  let player = null;
  let ctx = null; // лічильники поточного запуску
  let pushFrame = null; // як кадри потрапляють у блок «Що сталося»: по одному чи згорнуто
  let panelState = {}; // стан пісочниці для панелей під кодом: файли, задачі…

  section.editor = () => editor; // для автотестів

  // ---------- вибір моделі
  const canRun = () => mode === "stub" || realModel.ready;

  function setMode(newMode) {
    mode = newMode;
    section.querySelectorAll(".seg button").forEach((b) => b.classList.toggle("on", b.dataset.mode === mode));
    section.querySelector('[data-mode="real"]').textContent =
      "Справжня модель" + (realModel.ready ? "" : " · не підключена");
    const hint = section.querySelector(".modehint");
    hint.innerHTML = mode === "real" ? realModelHint() : STUB_HINT;
    hint.querySelector(".recheck")?.addEventListener("click", async () => {
      await loadModelStatus();
      setMode(mode);
    });
    runButton.disabled = !canRun();
  }
  section.querySelectorAll(".seg button").forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
  setMode("stub");

  section.querySelector(".reset").onclick = () => {
    editor = replaceEditor(editor, code, freshLines, () => run());
  };

  // ---------- запуск
  function stopWorker() {
    clearTimeout(timeout);
    player?.setWaiting(false);
    worker?.terminate();
    worker = null;
    runButton.disabled = !canRun();
    stopButton.hidden = true;
  }

  stopButton.onclick = () => {
    stopWorker();
    if (!player) return;
    framesFor({ type: "error", stopped: true }, ctx).forEach((frame) => pushFrame(stamp(frame)));
    finishRun();
  };

  function run() {
    if (!canRun()) return; // ⌘/Ctrl+Enter оминає вимкнену кнопку — тому перевіряємо тут
    stopWorker();
    out.innerHTML = "";
    ctx = { calls: 0, tokens: [], cost: 0, mode, loop: null, describe: lesson.describe };
    panelState = {};
    // Панелі (дошка, файли, git) показують стан на момент кадру, який зараз видно,
    // тож гортаючи кадри, бачиш, як він змінювався
    let drawnState = null;
    player = createPlayer(out, showAfterRun, (frame) => {
      const state = frame?.state ?? panelState;
      if (state === drawnState) return; // той самий стан — не перемальовуємо, щоб не згортались розгорнуті деталі
      drawnState = state;
      drawPanels(out, step.panels, state);
    });
    // Цикл агента вже знайомий? Тоді показуємо крупніше (див. agent-fold.js)
    pushFrame = (step.foldAgent ?? lesson.foldAgent) ? createAgentFolder(player) : pushFolded;
    player.live = mode === "real";
    runButton.disabled = true;
    stopButton.hidden = false;

    // Твій код виконується в окремому потоці (Web Worker) — сторінку він не зламає
    worker = new Worker(`runtime/worker.js?v=${WORKER_VERSION}`, { type: "module" });
    const limitSeconds = mode === "real" ? 180 : 30;
    timeout = setTimeout(() => {
      stopWorker();
      player.push(
        stamp({
          actor: "code",
          kind: "bad",
          title: "Зупинено",
          say: `Програма працювала понад ${limitSeconds} секунд.`,
        }),
      );
      finishRun();
    }, limitSeconds * 1000);

    worker.onmessage = ({ data: event }) => {
      // Події про стан пісочниці (файли, трекер…) оновлюють панелі під кодом
      if (STATE_EVENTS[event.type]) {
        // Новий об'єкт стану: старі кадри зберігають свій
        panelState = { ...panelState };
        STATE_EVENTS[event.type](panelState, event);
        if (!player.frames.length) player.draw(); // кадрів ще немає — показуємо стан на старті
        return;
      }
      if (mode === "real") player.setWaiting(event.type === "request");
      if (event.type === "reply" && event.cost) ctx.cost += event.cost;
      framesFor(event, ctx).forEach((frame) => pushFrame(stamp(frame)));
      if (event.type === "done" || event.type === "error") {
        stopWorker();
        finishRun();
      }
    };
    worker.postMessage({
      type: "run",
      code: editor.state.doc.toString(),
      mode,
      scenario: step.scenario,
      sandbox: lesson.sandboxUrl,
    });
    out.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  runButton.onclick = run;

  function finishRun() {
    player.live = false; // далі не перескакуємо: хай учень дочитає останню відповідь
    player.done = true;
    const total = ctx.tokens.reduce((a, b) => a + b, 0);
    const price =
      ctx.mode !== "real"
        ? " · без справжньої моделі токени рахуємо на око"
        : realModel.free
          ? " · безкоштовно"
          : ctx.cost
            ? ` · ≈ $${ctx.cost.toFixed(5)}`
            : " · модель платна, але її ціну лабораторія не знає — дивись у кабінеті провайдера";
    player.el.querySelector(".stats").innerHTML =
      `Модель викликали <b>${ctx.calls}</b> р. · відправили їй загалом ≈ <b>${total}</b> токенів ` +
      `(по колах: ${ctx.tokens.join(" + ") || 0})${price}`;

    // Деякі кроки на справжній моделі поводяться інакше, ніж на заготовці, —
    // тоді в кроці є своя чесна примітка (realModelNote), і показуємо її
    const summary =
      mode === "real" && step.realModelNote
        ? step.realModelNote
        : fixed
          ? (step.fixInsight ?? step.insight)
          : step.insight;
    pushFrame(stamp({ actor: "code", kind: "end", title: "Що ми щойно побачили", say: summary }));
  }

  // Кадр запам'ятовує, який вигляд мала пісочниця, коли він з'явився
  function stamp(frame) {
    frame.state = panelState;
    return frame;
  }

  // ---------- згортання циклу: після 3 однакових прохань решту кола показуємо одним кадром
  // Кадри розрізняємо за тегом (а не за текстом), тож зміна формулювань нічого не зламає.
  const isRequest = (frame) => frame.tag === "ask";
  const isLoopPart = (frame) => ["ask", "tool", "back", "call"].includes(frame.tag);

  function pushFolded(frame) {
    const loop = (ctx.loop ??= { last: null, repeats: 0, folded: null });
    if (loop.folded) {
      const sameLoop = isLoopPart(frame) && (!isRequest(frame) || frame.say === loop.last);
      if (sameLoop) {
        if (isRequest(frame)) {
          loop.folded.count++;
          loop.folded.state = frame.state;
          loop.folded.say = `Модель знову і знову просить те саме: ще <b>${timesCount(loop.folded.count)}</b> поспіль.`;
          player.draw();
        }
        return;
      }
      loop.folded = null;
      loop.repeats = 0;
    }
    if (isRequest(frame)) {
      loop.repeats = frame.say === loop.last ? loop.repeats + 1 : 1;
      loop.last = frame.say;
      if (loop.repeats === 3) {
        player.push(frame);
        loop.folded = {
          actor: "code-model",
          dir: "←",
          kind: "bad",
          title: "Цикл повторюється",
          count: 0,
          say: "Модель знову і знову просить те саме.",
          state: frame.state,
          why: "З кожним колом розмова довшає, і кожен наступний виклик дорожчий. Подивись на лічильник токенів унизу.",
        };
        player.push(loop.folded);
        return;
      }
    }
    player.push(frame);
  }

  // ---------- після першого перегляду: виправлення або «Покрути» + наступний крок
  function showAfterRun() {
    if (shownAfterRun) return;
    shownAfterRun = true;

    if (step.fixSource && !fixed) {
      const box = document.createElement("div");
      box.className = "fixbox";
      box.innerHTML = `<h3>${esc(step.fixTitle)}</h3><p>${step.fixText}</p><button class="outline">Застосувати виправлення</button>`;
      box.querySelector("button").onclick = () => {
        fixed = true;
        code = step.fixSource;
        freshLines = newLines(step.source, step.fixSource);
        editor = replaceEditor(editor, code, freshLines, () => run());
        setMode("stub");
        box.remove();
        shownAfterRun = false;
        out.innerHTML = "";
        section.querySelector(".editor").scrollIntoView({ behavior: "smooth", block: "center" });
      };
      section.appendChild(box);
      return;
    }

    const tryBox = document.createElement("div");
    tryBox.className = "try";
    tryBox.innerHTML = `<h3>Покрути</h3><ul>${step.try.map((tip) => `<li>${tip}</li>`).join("")}</ul>`;
    section.appendChild(tryBox);

    const isLast = index + 1 >= steps.length;
    const nextButton = document.createElement("button");
    nextButton.className = "next";
    nextButton.innerHTML = isLast
      ? `<span class="next-l">Кінець уроку</span><span class="next-t">Перевір себе →</span>`
      : `<span class="next-l">Наступний крок ${index + 2} / ${steps.length}</span><span class="next-t">${esc(steps[index + 1].title)} →</span>`;
    nextButton.onclick = () => {
      nextButton.remove();
      onNext();
    };
    section.appendChild(nextButton);
  }

  return section;
}
