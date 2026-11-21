// Згортання кадрів для уроків, де цикл агента вже знайомий (з уроку 2).
// Учень бачив кожне коло в уроці 1, тож тут показуємо крупніше:
//   • усю роботу агента над задачею — одним кадром (кола можна розгорнути);
//   • кілька дій коду з трекером підряд — теж одним кадром;
//   • якщо код знову і знову бере ту саму задачу — один кадр з лічильником.
import { esc } from "./util.js";

// Кадри, які належать циклу агента (див. теги у frames.js)
const AGENT_TAGS = ["call", "ask", "tool", "back", "answer"];

export function createAgentFolder(player) {
  let group = null; // кадр «Агент працює над задачею», який зараз наповнюється
  let codeFrame = null; // кадр з діями коду, який зараз наповнюється
  let lastTask = null; // над якою задачею агент працював минулого разу
  let repeat = null; // кадр «та сама задача по колу»
  let held = []; // кадри коду, поки не ясно, чи це знову той самий повтор

  function taskOf(frame) {
    const first = frame.messages?.[0]?.content;
    return typeof first === "string" ? first.split("\n")[0] : null;
  }

  function startGroup(frame) {
    const task = taskOf(frame);
    if (task && task === lastTask) {
      // Код знову віддав агенту ту саму задачу
      if (repeat) {
        repeat.count++;
        repeat.say = `Код знову віддає агенту «${esc(task)}». Уже <b>${repeat.count}</b> рази поспіль.`;
        held = []; // ті самі дії коду, що й минулого разу, — не показуємо
        player.draw();
        return "swallow";
      }
      repeat = {
        actor: "code",
        kind: "bad",
        title: "Та сама задача ще раз",
        count: 2,
        say: `Код знову віддає агенту «${esc(task)}». Уже <b>2</b> рази поспіль.`,
        why: "Агент цю задачу вже брав. Код цього не пам'ятає, тому бере її знову, а з нею і нові виклики моделі.",
      };
      flushHeld();
      player.push(repeat);
      return "swallow";
    }
    closeRepeat();
    flushHeld();
    codeFrame = null;
    lastTask = task ?? lastTask;
    group = {
      tag: "agent",
      actor: "code-model",
      dir: "→",
      kind: "model",
      title: "Агент працює над задачею",
      inner: [],
      why: "Це той самий цикл з уроку 1: модель просить, код виконує, результат іде назад. Тут він згорнутий в один кадр. Розгорни, щоб подивитись кожне коло.",
    };
    player.push(group);
    return "group";
  }

  function describeGroup() {
    const turns = group.inner.filter((f) => f.tag === "call").length;
    const asks = group.inner.filter((f) => f.tag === "ask").flatMap((f) => f.say.split("<br>"));
    const answer = group.inner.find((f) => f.tag === "answer");
    const lines = [
      lastTask ? `<b>${esc(lastTask)}</b>` : "",
      `Кіл: <b>${turns}</b>.`,
      asks.length ? `Що агент робив:<br>${asks.map((a) => `• ${a}`).join("<br>")}` : "",
      answer ? `Наостанок відповів: ${answer.say}` : "",
    ];
    group.say = lines.filter(Boolean).join("<br>");
    const id = lastTask?.match(/^Задача (\S+):/)?.[1];
    if (id) group.title = `Агент працює над ${esc(id)}`;
    const lastCall = [...group.inner].reverse().find((f) => f.messages);
    group.messages = lastCall?.messages;
  }

  function closeRepeat() {
    repeat = null;
  }

  function flushHeld() {
    held.forEach(pushCode);
    held = [];
  }

  // Дії коду з трекером: дві й більше підряд зливаємо в один кадр
  function pushCode(frame) {
    if (!codeFrame) {
      codeFrame = { ...frame, inner: [frame] };
      player.push(codeFrame);
      return;
    }
    codeFrame.inner.push(frame);
    codeFrame.title = "Код сам працює з трекером";
    codeFrame.say = codeFrame.inner.map((f) => `• ${f.title}`).join("<br>");
    codeFrame.why = "Це робить код, без моделі. Розгорни, щоб побачити відповідь трекера на кожну дію.";
    codeFrame.json = undefined;
    player.draw();
  }

  return function push(frame) {
    if (AGENT_TAGS.includes(frame.tag)) {
      codeFrame = null;
      if (!group) {
        if (startGroup(frame) === "swallow") {
          group = { inner: [], swallowed: true }; // кола повтору не показуємо
          return;
        }
      }
      group.inner.push(frame);
      if (!group.swallowed) {
        describeGroup();
        player.draw();
      }
      if (frame.tag === "answer") group = null;
      return;
    }

    // Будь-який інший кадр закінчує роботу агента над задачею
    group = null;
    if (frame.tag === "code-tool") {
      if (repeat) held.push(frame);
      else pushCode(frame);
      return;
    }
    codeFrame = null;
    flushHeld();
    player.push(frame);
  };
}
