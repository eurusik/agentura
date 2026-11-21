// Блок «Що сталося» під кодом: показує запуск по кадрах, один кадр за раз.
// Гортаєш кнопками або стрілками ← →.
import { messagesCount } from "./util.js";
import { jsonHTML, messagesHTML } from "./frames.js";

let activePlayer = null; // стрілки на клавіатурі гортають останній блок «Що сталося», до якого ти торкався

document.addEventListener("keydown", (event) => {
  if (!activePlayer || event.target.closest?.(".cm-editor") || event.target.tagName === "INPUT") return;
  if (event.key === "ArrowRight") activePlayer.go(1);
  else if (event.key === "ArrowLeft") activePlayer.go(-1);
  else return;
  event.preventDefault();
});

const TEMPLATE = `
  <div class="player-h">Що сталося <span class="muted">— запуск по кадрах, гортай <kbd>←</kbd> <kbd>→</kbd></span></div>
  <div class="actors">
    <div class="actor" data-a="model"><i>AI</i><b>Модель</b></div>
    <div class="link" data-l="code-model"><span class="arr"></span></div>
    <div class="actor" data-a="code"><i>JS</i><b>Твій код</b></div>
    <div class="link" data-l="code-tools"><span class="arr"></span></div>
    <div class="actor" data-a="tools"><i>fn</i><b>Інструменти</b></div>
  </div>
  <div class="frame"></div>
  <div class="thinking" hidden></div>
  <div class="controls">
    <button class="nav prev">← Назад</button>
    <span class="dots"></span>
    <button class="nav nextf">Далі →</button>
    <button class="nav all">До кінця ⇥</button>
  </div>
  <div class="stats muted"></div>`;

// onEnd викликається, коли ти догортав до останнього кадру завершеного запуску
export function createPlayer(container, onEnd) {
  const el = document.createElement("div");
  el.className = "player";
  el.innerHTML = TEMPLATE;
  container.appendChild(el);

  const frameEl = el.querySelector(".frame");
  const thinkingEl = el.querySelector(".thinking");
  const player = {
    el,
    frames: [],
    index: -1,
    done: false, // запуск завершився, нових кадрів не буде
    live: false, // справжня модель: кадри приходять поступово, і блок іде за ними
  };

  function drawActors(frame) {
    el.querySelectorAll(".actor").forEach((actor) => {
      const who = actor.dataset.a;
      const active =
        frame && (frame.actor === "code" ? who === "code" : frame.actor?.split("-").includes(who));
      actor.classList.toggle("on", Boolean(active));
    });
    // dir "→" — код щось відправляє, "←" — код щось отримує.
    // Модель стоїть ЛІВОРУЧ від коду, інструменти — ПРАВОРУЧ, тому для моделі стрілку розвертаємо.
    el.querySelectorAll(".link").forEach((link) => {
      const active = frame && frame.actor === link.dataset.l;
      const pointsLeft = link.dataset.l === "code-model" ? frame?.dir === "→" : frame?.dir === "←";
      link.classList.toggle("on", Boolean(active));
      link.querySelector(".arr").textContent = !active ? "────" : pointsLeft ? "◀────" : "────▶";
    });
  }

  function drawFrame(frame) {
    if (!frame) {
      frameEl.innerHTML = `<div class="muted">Програма працює…</div>`;
      return;
    }
    const counter = `${player.index + 1} / ${player.frames.length}${player.done ? "" : "…"}`;
    const seen = frame.messages
      ? `<details class="mini"><summary>Що бачить модель (${messagesCount(frame.messages.length)})</summary>${messagesHTML(frame.messages)}</details>`
      : "";
    const details = frame.json
      ? `<details class="mini"><summary>Деталі (JSON)</summary><pre class="json">${jsonHTML(frame.json)}</pre></details>`
      : "";
    // Згорнутий кадр (див. agent-fold.js): усе, що в ньому, можна розгорнути
    const inner =
      frame.inner?.length > 1 || frame.tag === "agent"
        ? `<details class="mini"><summary>Розгорнути (${frame.inner.length})</summary><ol class="inner">${frame.inner
            .map((f) => `<li><b>${f.title}</b><div>${f.say}</div></li>`)
            .join("")}</ol></details>`
        : "";
    frameEl.className = `frame ${frame.kind}`;
    frameEl.innerHTML = `
      <div class="ft">${counter} · ${frame.title}</div>
      <div class="say">${frame.say}</div>
      ${frame.why ? `<div class="why">${frame.why}</div>` : ""}
      ${inner}${seen}${details}`;
  }

  player.draw = () => {
    const frame = player.frames[player.index];
    drawActors(frame);
    drawFrame(frame);
    const isLast = player.index >= player.frames.length - 1;
    el.querySelector(".dots").innerHTML = player.frames
      .map((_, k) => `<i class="${k === player.index ? "on" : k < player.index ? "seen" : ""}"></i>`)
      .join("");
    el.querySelector(".prev").disabled = player.index <= 0;
    el.querySelector(".nextf").disabled = isLast;
    el.querySelector(".all").disabled = isLast;
  };

  player.push = (frame) => {
    // Якщо ти дивишся на найновіший кадр — переходимо на новий.
    // Якщо відгорнув назад, щоб перечитати, — лишаємо, де ти є.
    const wasOnNewest = player.index === player.frames.length - 1;
    player.frames.push(frame);
    if (player.index === -1) player.index = 0;
    else if (player.live && wasOnNewest) player.index = player.frames.length - 1;
    player.draw();
  };

  player.go = (step) => {
    const next = Math.max(0, Math.min(player.frames.length - 1, player.index + step));
    if (next === player.index) return;
    player.index = next;
    player.draw();
    if (player.index === player.frames.length - 1 && player.done) onEnd?.();
  };

  // «Модель думає… N с» — поки справжня модель відповідає (на ноутбуці це секунди)
  let thinkingTimer = null;
  player.setWaiting = (waiting) => {
    clearInterval(thinkingTimer);
    thinkingEl.hidden = !waiting;
    if (!waiting) return;
    const startedAt = Date.now();
    const tick = () => {
      const seconds = Math.round((Date.now() - startedAt) / 1000);
      thinkingEl.innerHTML = `<span class="pulse-dot"></span>Модель думає… ${seconds} с <span class="muted">— справжня модель на твоєму комп'ютері відповідає не миттєво. Можеш поки гортати кадри.</span>`;
    };
    tick();
    thinkingTimer = setInterval(tick, 1000);
  };

  el.querySelector(".prev").onclick = () => player.go(-1);
  el.querySelector(".nextf").onclick = () => player.go(1);
  el.querySelector(".all").onclick = () => player.go(player.frames.length);
  el.addEventListener("pointerdown", () => (activePlayer = player));

  activePlayer = player;
  player.draw();
  return player;
}
