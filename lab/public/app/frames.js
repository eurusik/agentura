// Перетворює «сирі» події з runtime-worker.js на кадри блоку «Що сталося»:
// один кадр = хто діє + одне речення людською мовою + за бажанням деталі (JSON).
import { esc, short, messagesCount } from "./util.js";

// Як виглядає прохання моделі людською мовою.
// Опис конкретних кнопок дає пісочниця уроку (ctx.describe), інакше — загальне «Натисни …».
function describeRequest(request, ctx) {
  return (
    ctx.describe?.(request.name, request.input ?? {}, esc) ?? `«Натисни <code>${esc(request.name)}</code>»`
  );
}

// Кадр для запиту коду до моделі (і, якщо є, для результатів, які код їй віддає)
function framesForRequest(event, ctx) {
  const frames = [];
  const last = event.messages[event.messages.length - 1];
  const results = Array.isArray(last?.content)
    ? last.content.filter((part) => part.type === "tool_result")
    : [];

  if (results.length) {
    const refused = results.some((result) => result.is_error);
    frames.push({
      tag: "back",
      actor: "code-model",
      dir: "→",
      kind: refused ? "bad" : "code",
      title: refused ? "Код каже моделі: не вийшло" : "Код віддає моделі результат",
      say: results.map((r) => `${r.is_error ? "Відмова: " : ""}«${esc(short(r.content, 90))}»`).join("<br>"),
      why: refused
        ? "Програма не впала. Вона повернула моделі відмову чи помилку як звичайний результат (<code>is_error: true</code>), і модель може спробувати інакше."
        : "Результат інструмента (<code>tool_result</code>) дописуємо в розмову. Без цього модель про нього не дізнається.",
      json: results,
    });
  }

  // Токени рахуємо приблизно: ~4 символи на токен
  const tokens = Math.ceil(JSON.stringify([event.messages, event.toolDefs]).length / 4);
  ctx.tokens.push(tokens);
  const isFirst = ctx.calls === 0;
  const toolNames = event.tools.length
    ? `Разом з розмовою йде список інструментів: <code>${event.tools.join("</code>, <code>")}</code>. `
    : "Інструментів моделі не дали, тож відповісти вона може тільки текстом. ";

  frames.push({
    tag: "call",
    actor: "code-model",
    dir: "→",
    kind: "code",
    title: isFirst ? "Код питає модель" : "Код знову кличе модель",
    say: isFirst
      ? `«${esc(short(typeof last?.content === "string" ? last.content : "…"))}»`
      : `і знову відправляє всю розмову, в ній уже <b>${messagesCount(event.messages.length)}</b>.`,
    why:
      toolNames +
      (isFirst
        ? `Це приблизно ${tokens} токенів (токен — шматочок тексту, 3–4 літери).`
        : `Модель нічого не пам'ятає, тому бачить тільки те, що ми відправили. Це вже приблизно ${tokens} токенів за один виклик, і платиш ти за всі.`),
    messages: event.messages,
    json: { messages: event.messages, tools: event.toolDefs },
  });
  ctx.calls++;
  return frames;
}

// Кадр для відповіді моделі: або прохання запустити інструмент, або просто текст
function framesForReply(event, ctx) {
  const parts = event.content || [];
  const requests = parts.filter((part) => part.type === "tool_use");
  if (requests.length) {
    const several = requests.length > 1 ? `, одразу ${requests.length}` : "";
    return [
      {
        tag: "ask",
        actor: "code-model",
        dir: "←",
        kind: "model",
        title: "Модель просить запустити інструмент",
        say: requests.map((request) => describeRequest(request, ctx)).join("<br>"),
        why: `Сама модель нічого не запускає, це лише прохання (<code>tool_use</code>)${several}. Далі вирішує код: виконати його чи ні.`,
        json: parts,
      },
    ];
  }
  const text = parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join(" ");
  return [
    {
      actor: "code-model",
      dir: "←",
      kind: "model",
      title: "Модель відповідає",
      say: `«${esc(text)}»`,
      why: "Модель нічого не просить, тільки відповідає текстом. Для коду це знак, що роботу закінчено.",
      json: parts,
    },
  ];
}

// Кадр для запущеного інструмента
function framesForTool(event) {
  if (event.escaped) {
    return [
      {
        actor: "code-tools",
        dir: "→",
        kind: "bad",
        title:
          event.name === "write_file"
            ? "Код записав файл поза робочою папкою"
            : "Код заліз за межі робочої папки",
        say: `<code>${esc(event.name)}(${esc(JSON.stringify(event.input))})</code>`,
        why: "Модель попросила, і код виконав, нічого не перевіривши. Шлях ніхто не порівняв з папкою <code>/work</code>, тому файл і опинився назовні.",
        json: event,
      },
    ];
  }
  return [
    {
      tag: "tool",
      actor: "code-tools",
      dir: "→",
      kind: event.ok ? "tool" : "bad",
      title: event.ok ? `Код запускає ${esc(event.name)}` : `Інструмент ${esc(event.name)} не спрацював`,
      say: `<pre>${esc(short(event.output, 220))}</pre>`,
      why: event.ok
        ? "Інструмент запускає наш код. Модель тільки попросила."
        : "Інструмент упав з помилкою, і код її не перехопив. Через це впала вся програма, а модель так і не дізналась, що сталось.",
      json: event,
    },
  ];
}

export function framesFor(event, ctx) {
  switch (event.type) {
    case "request":
      return framesForRequest(event, ctx);
    case "reply":
      return framesForReply(event, ctx);
    case "tool":
      return framesForTool(event);
    case "log":
      return [
        { actor: "code", kind: "code", title: "Код пише в консоль", say: `<pre>${esc(event.text)}</pre>` },
      ];
    case "error":
      if (event.stopped)
        return [{ actor: "code", kind: "code", title: "Ти зупинив програму", say: "Кнопкою «Стоп»." }];
      return [
        {
          actor: "code",
          kind: "bad",
          title: event.cap ? "Лабораторія зупинила програму" : "Код упав із помилкою",
          say: esc(event.message),
        },
      ];
    default:
      return [];
  }
}

// JSON з легкою підсвіткою: ключі, рядки, числа, true/false/null
export function jsonHTML(value) {
  const source = esc(JSON.stringify(value, null, 2));
  const token =
    /("(?:\\u[0-9a-fA-F]{4}|\\[^u]|[^\\"])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  return source.replace(token, (match, string, colon, literal) => {
    if (string && colon) return `<span class="j-key">${string}</span><span class="j-p">:</span>`;
    if (string) return `<span class="j-str">${string}</span>`;
    if (literal) return `<span class="j-lit">${match}</span>`;
    return `<span class="j-num">${match}</span>`;
  });
}

// Переписка у вигляді «бульбашок» — блок «Що бачить модель»
export function messagesHTML(messages) {
  const partHTML = (part) => {
    if (part.type === "text") return esc(part.text);
    if (part.type === "tool_use") {
      return `<span class="tu">прохання ${esc(part.name)}(${esc(JSON.stringify(part.input))})</span>`;
    }
    if (part.type === "tool_result") {
      return `<span class="tr">результат${part.is_error ? " (відмова)" : ""}: ${esc(short(part.content, 80))}</span>`;
    }
    return "";
  };
  return messages
    .map((message) => {
      const content =
        typeof message.content === "string" ? esc(message.content) : message.content.map(partHTML).join(" ");
      return `<div class="bubble ${message.role}"><span class="role">${message.role}</span>${content}</div>`;
    })
    .join("");
}
