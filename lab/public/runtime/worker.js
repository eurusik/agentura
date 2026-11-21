// Тут виконується код учня — в окремому потоці (Web Worker), тож сторінку він не зламає.
// Двигун спільний для всіх уроків. Що саме лежить у пісочниці (файли, інструменти, заготовка моделі),
// бере з sandbox.js поточного уроку.
//
// Код учня отримує готові model(), tools, resolvePath() і console, а все, що відбувається,
// ми повідомляємо сторінці подіями (fs, request, reply, tool, log, done, error) — з них вона будує кадри.
import { createWorkspace, resolvePath } from "./workspace.js";

const MAX_MODEL_CALLS = 25; // більше разів лабораторія модель не кличе — захист від вічного циклу

// Пропускаємо подію через JSON: так зникають функції та інше, на чому postMessage падає
const report = (event) => postMessage(JSON.parse(JSON.stringify(event)));

// Приблизна кількість токенів (~4 символи на токен) — щоб і на заготовці було видно, як росте ціна
const estimateTokens = (value) => Math.ceil(JSON.stringify(value ?? "").length / 4);

// Справжній API відхиляє зламану розмову. Ми перевіряємо так само — для будь-якої моделі,
// бо Ollama й OpenAI-сумісні API можуть мовчки її прийняти, а уроки показують саме цю помилку.
function checkHistoryLikeApi(messages) {
  const reject = (why) => {
    throw new Error(`API не прийняв запит (помилка 400): ${why}`);
  };
  if (!messages.length || messages[0].role !== "user")
    reject("розмова має починатися з повідомлення від user.");

  messages.forEach((message, i) => {
    if (message.role !== "user" || typeof message.content === "string") return;
    const previous = messages[i - 1];
    const askedIds =
      previous?.role === "assistant" && Array.isArray(previous.content)
        ? previous.content.filter((part) => part.type === "tool_use").map((part) => part.id)
        : [];
    for (const part of message.content) {
      if (part.type === "tool_result" && !askedIds.includes(part.tool_use_id)) {
        reject(
          "у переписці є результат інструмента, але немає прохання, на яке він відповідає. Модель просто не бачить, що вона щось просила. Підказка: додай її відповідь у messages.",
        );
      }
    }
  });
}

// model() — те, що викликає код учня. Однакова для заготовки і справжньої моделі.
function createModel({ mode, stub }) {
  let calls = 0;
  return async function model(request = {}) {
    calls++;
    if (calls > MAX_MODEL_CALLS) {
      const error = new Error(
        `Модель викликали вже ${MAX_MODEL_CALLS} разів — далі лабораторія не пускає. У справжній програмі цикл крутився б і далі, а гроші списувались би.`,
      );
      error.labCap = true; // сторінка покаже «Лабораторія зупинила програму», а не «Код упав»
      throw error;
    }
    const messages = request.messages ?? [];
    checkHistoryLikeApi(messages);
    report({
      type: "request",
      n: calls,
      messages,
      tools: (request.tools ?? []).map((tool) => tool.name),
      toolDefs: request.tools ?? [],
      system: request.system ?? "",
    });

    let reply;
    if (mode === "real") {
      // Справжню модель кличе сервер лабораторії — ключі з .env лишаються там
      const response = await fetch("/api/model", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      });
      reply = await response.json();
      if (reply.error) throw new Error(reply.error);
    } else {
      reply = stub(request);
    }

    reply.usage ??= {
      input_tokens: estimateTokens([messages, request.tools]),
      output_tokens: estimateTokens(reply.content),
      estimated: true,
    };
    report({
      type: "reply",
      n: calls,
      content: reply.content,
      stop_reason: reply.stop_reason,
      usage: reply.usage,
      cost: reply.cost ?? 0,
    });
    return reply;
  };
}

// console.log учня показуємо в блоці «Що сталося»
const learnerConsole = {
  log: (...values) => {
    const text = values.map((v) => (typeof v === "string" ? v : JSON.stringify(v, null, 2))).join(" ");
    report({ type: "log", text });
  },
};

// Сторінка надсилає: { type: "run", code, mode, scenario, sandbox: <адреса sandbox.js уроку> }
onmessage = async ({ data }) => {
  if (data.type !== "run") return;
  try {
    const sandbox = await import(data.sandbox);
    const workspace = createWorkspace(sandbox.FILES, report);
    const tools = sandbox.createTools(workspace, report);
    const model = createModel({
      mode: data.mode,
      stub: (request) => sandbox.stubModel(request, data.scenario),
    });
    workspace.reportFiles();

    // Код учня стає тілом async-функції, а model, tools, resolvePath і console — її параметрами
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const learnerCode = new AsyncFunction("model", "tools", "resolvePath", "console", data.code);
    await learnerCode(model, tools, resolvePath, learnerConsole);
    report({ type: "done" });
  } catch (error) {
    report({ type: "error", message: error?.message ?? String(error), cap: error?.labCap === true });
  }
};
