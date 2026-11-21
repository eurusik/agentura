// Згортання кадрів для уроків, де цикл агента вже знайомий (з уроку 2).
// Учень бачив кожне коло в уроці 1, тож тут показуємо крупніше:
//   • усю роботу агента над задачею — одним кадром (кола можна розгорнути);
//   • кілька дій коду з трекером підряд — теж одним кадром;
//   • якщо код знову і знову бере ту саму задачу — один кадр з лічильником.
import { esc, timesCount } from "./util.js";

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
        repeat.state = frame.state;
        sayRepeat();
        held = []; // ті самі дії коду, що й минулого разу, — не показуємо
        player.draw();
        return "swallow";
      }
      repeat = {
        actor: "code",
        kind: "bad",
        title: "Та сама задача ще раз",
        count: 2,
        task,
        state: frame.state,
        why: "Агент цю задачу вже брав. Код цього не пам'ятає, тому бере її знову, а з нею і нові виклики моделі.",
      };
      sayRepeat();
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
      state: frame.state,
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
      whoRan(),
      answer ? `Наостанок відповів: ${answer.say}` : "",
    ];
    group.say = lines.filter(Boolean).join("<br>");
    const id = lastTask?.match(/^Задача (\S+):/)?.[1];
    if (id) group.title = `Агент працює над ${esc(id)}`;
    const lastCall = [...group.inner].reverse().find((f) => f.messages);
    group.messages = lastCall?.messages;
  }

  // Хто виконав інструменти: лабораторія чи MCP-сервер (з уроку 3)
  function whoRan() {
    const runs = group.inner.filter((f) => f.tag === "tool" && f.event);
    if (!runs.some((f) => f.event.server)) return "";
    const counts = {};
    for (const f of runs) {
      const who = f.event.server ? `сервер ${f.event.server}` : "лабораторія";
      counts[who] = (counts[who] ?? 0) + 1;
    }
    const list = Object.entries(counts).map(([who, n]) => `${who} — ${timesCount(n)}`);
    return `Інструменти виконали: ${list.join(", ")}.`;
  }

  function sayRepeat() {
    repeat.say = `Код знову віддає агенту «${esc(repeat.task)}». Уже <b>${timesCount(repeat.count)}</b> поспіль.`;
  }

  function closeRepeat() {
    repeat = null;
  }

  function flushHeld() {
    held.forEach(pushCode);
    held = [];
  }

  // Дії коду з одним і тим самим (трекером або MCP-серверами) підряд зливаємо в один кадр.
  // Різне не змішуємо: розмова з MCP-серверами — окремий кадр, щоб її було видно
  const CODE_TITLES = { tracker: "Код сам працює з трекером", mcp: "Код підключається до серверів" };

  function pushCode(frame) {
    const source = frame.event?.name;
    if (!codeFrame || codeFrame.source !== source) {
      codeFrame = { ...frame, inner: [frame], source };
      player.push(codeFrame);
      return;
    }
    codeFrame.inner.push(frame);
    codeFrame.state = frame.state;
    codeFrame.title = CODE_TITLES[source] ?? "Код сам робить кілька дій";
    codeFrame.say = codeFrame.inner.map((f) => `• ${f.title}`).join("<br>");
    codeFrame.why = "Це робить код, без моделі. Розгорни, щоб побачити відповідь на кожну дію.";
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
      // Кадр агента показує стан на кінець його роботи; повтор — на кінець останнього разу
      if (group.swallowed) {
        if (repeat) repeat.state = frame.state;
        player.draw();
      } else {
        group.state = frame.state;
      }
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
    if (repeat && held.length && frame.kind === "bad") {
      repeat.count++; // код устиг узяти задачу ще раз, а далі його зупинили
      repeat.state = frame.state;
      sayRepeat();
      held = [];
    }
    flushHeld();
    player.push(frame);
  };
}
