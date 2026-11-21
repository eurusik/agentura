/**
 * Справжня модель для лабораторії — необов'язково. Без неї все працює на заготовках.
 *
 * Шукаємо, що ти підключив, у такому порядку (перше знайдене перемагає):
 *   1. ANTHROPIC_API_KEY у .env                         → Claude (платно)
 *   2. OPENAI_BASE_URL + OPENAI_API_KEY + OPENAI_MODEL   → будь-який OpenAI-сумісний API:
 *                                                         OpenRouter, Groq, Gemini… (часто є безкоштовний ліміт)
 *   3. Ollama, запущена на цьому комп'ютері              → локальна модель, безкоштовно, без ключа
 *
 * Код уроку завжди говорить одним форматом — форматом Anthropic (tool_use / tool_result).
 * Для Ollama й OpenAI-сумісних API ми перекладаємо запит «туди» і відповідь «назад»,
 * тому уроки не залежать від того, яку модель ти обрав.
 */
import Anthropic from "@anthropic-ai/sdk";
import { HAIKU_PRICE } from "../src/p0/anthropicModel.ts";

// ---------- типи
type Part = { type: string; [key: string]: any }; // шматок повідомлення: text, tool_use, tool_result
type Message = { role: "user" | "assistant"; content: string | Part[] };
type ToolDef = { name: string; description?: string; input_schema: any };

export type Req = { system?: string; messages: Message[]; tools?: ToolDef[] };
export type Reply = {
  content: Part[];
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number };
  cost: number; // у доларах; 0 — безкоштовно або ціна невідома
};
export type Status = {
  ready: boolean;
  provider?: "anthropic" | "openai" | "ollama";
  label?: string; // що показати учню: «Claude (Anthropic)», «openrouter.ai», «Ollama на цьому комп'ютері»
  model?: string;
  free?: boolean;
  problem?: string; // що не так з налаштуваннями — показуємо учню як підказку
};

const OLLAMA_URL = (process.env.OLLAMA_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");
const TIMEOUT_MS = 170_000;

// У наших тестах qwen3:8b доводила задачу уроку до кінця 4 з 4.
// Менші (qwen3:4b, qwen2.5:7b) здебільшого кидали її на півдорозі.
export const RECOMMENDED = "qwen3:8b";

// =====================================================================
// 1. Що підключено?
// =====================================================================

// Сторінка питає статус часто, тож пам'ятаємо відповідь 3 секунди
let cached: { at: number; status: Status } | null = null;

export async function detect(force = false): Promise<Status> {
  if (!force && cached && Date.now() - cached.at < 3000) return cached.status;
  const status = detectClaude() ?? detectOpenAICompatible() ?? (await detectOllama());
  cached = { at: Date.now(), status };
  return status;
}

function detectClaude(): Status | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const model = process.env.ANTHROPIC_MODEL ?? "claude-haiku-5-5";
  return { ready: true, provider: "anthropic", label: "Claude (Anthropic)", model, free: false };
}

function detectOpenAICompatible(): Status | null {
  const { OPENAI_BASE_URL, OPENAI_API_KEY, OPENAI_MODEL, OPENAI_FREE } = process.env;
  if (!OPENAI_BASE_URL && !OPENAI_API_KEY && !OPENAI_MODEL) return null;

  const missing = Object.entries({ OPENAI_BASE_URL, OPENAI_API_KEY, OPENAI_MODEL })
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length) {
    return { ready: false, problem: `У .env бракує: ${missing.join(", ")}. Подивись зразок у .env.example.` };
  }

  let host: string;
  try {
    host = new URL(OPENAI_BASE_URL!).hostname;
  } catch {
    return {
      ready: false,
      problem: `OPENAI_BASE_URL у .env має бути повною адресою, наприклад https://openrouter.ai/api/v1 (зараз: ${OPENAI_BASE_URL})`,
    };
  }
  return { ready: true, provider: "openai", label: host, model: OPENAI_MODEL, free: OPENAI_FREE !== "false" };
}

async function detectOllama(): Promise<Status> {
  let installed: string[];
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(800) });
    installed = ((await response.json()).models ?? []).map((m: any) => m.name);
  } catch {
    return { ready: false }; // Ollama не запущена — нічого страшного, просто не підключено
  }

  if (!installed.length) {
    return {
      ready: false,
      problem: `Ollama запущена, але моделей у ній немає. У терміналі: ollama pull ${RECOMMENDED}`,
    };
  }
  const wanted = process.env.OLLAMA_MODEL;
  if (wanted && !installed.includes(wanted)) {
    return {
      ready: false,
      problem: `У .env вказано OLLAMA_MODEL=${wanted}, але такої моделі немає. Є: ${installed.join(", ")}. Або: ollama pull ${wanted}`,
    };
  }
  const model = wanted ?? (installed.includes(RECOMMENDED) ? RECOMMENDED : installed[0]);
  return { ready: true, provider: "ollama", label: "Ollama на цьому комп'ютері", model, free: true };
}

// =====================================================================
// 2. Спитати модель
// =====================================================================

export async function callModel(req: Req): Promise<Reply> {
  const status = await detect();
  if (!status.ready) throw new Error(status.problem ?? "Справжня модель не підключена.");
  if (status.provider === "anthropic") return askClaude(req, status.model!);
  if (status.provider === "ollama") return askOllama(req, status.model!);
  return askOpenAICompatible(req, status);
}

async function askClaude(req: Req, model: string): Promise<Reply> {
  const message = await new Anthropic().messages.create({
    model,
    max_tokens: 4096,
    ...(req.system ? { system: req.system } : {}),
    messages: req.messages as any,
    ...(req.tools?.length ? { tools: req.tools as any } : {}),
  });
  // Ціну знаємо тільки для Haiku. Для інших моделей кажемо 0, а сторінка пише «ціна невідома».
  const { input_tokens, output_tokens } = message.usage;
  const cost = /haiku/i.test(model)
    ? (input_tokens * HAIKU_PRICE.input + output_tokens * HAIKU_PRICE.output) / 1e6
    : 0;
  return {
    content: message.content as any,
    stop_reason: message.stop_reason ?? "end_turn",
    usage: message.usage,
    cost,
  };
}

async function askOllama(req: Req, model: string): Promise<Reply> {
  // Йдемо в «рідне» API Ollama, бо тільки тут надійно працює think: false.
  // З увімкненим «думанням» маленька модель спершу довго міркує вголос — 30–70 с на відповідь.
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages: toOllama(req),
      stream: false,
      think: false,
      ...(req.tools?.length ? { tools: toOpenAITools(req.tools) } : {}),
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok || data.error)
    throw new Error(`Ollama відповіла помилкою: ${data.error ?? response.status}`);
  return fromOllama(data);
}

async function askOpenAICompatible(req: Req, status: Status): Promise<Reply> {
  const baseUrl = process.env.OPENAI_BASE_URL!.replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: status.model,
      messages: toOpenAI(req),
      ...(req.tools?.length ? { tools: toOpenAITools(req.tools) } : {}),
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = data?.error?.message ?? JSON.stringify(data).slice(0, 300);
    throw new Error(`${status.label} відповів помилкою ${response.status}: ${reason}`);
  }
  return fromOpenAI(data);
}

// =====================================================================
// 3. Переклад між форматами (чисті функції, покриті тестами)
//    Anthropic:  assistant → [{ type: "tool_use", id, name, input }]
//                user      → [{ type: "tool_result", tool_use_id, content }]
//    OpenAI:     assistant → { tool_calls: [{ id, function: { name, arguments: "<JSON-рядок>" } }] }
//                tool      → { role: "tool", tool_call_id, content }
// =====================================================================

const textOf = (parts: Part[]) =>
  parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");

// Опис кнопок: { name, description, input_schema } → { type: "function", function: {…} }
export function toOpenAITools(tools: ToolDef[]) {
  return tools.map((tool) => ({
    type: "function",
    function: { name: tool.name, description: tool.description ?? "", parameters: tool.input_schema },
  }));
}

// Переписка з формату Anthropic у формат OpenAI
export function toOpenAI(req: Req): any[] {
  const out: any[] = [];
  if (req.system) out.push({ role: "system", content: req.system });

  for (const message of req.messages) {
    if (typeof message.content === "string") {
      out.push({ role: message.role, content: message.content });
      continue;
    }

    if (message.role === "assistant") {
      const toolCalls = message.content
        .filter((part) => part.type === "tool_use")
        .map((part) => ({
          id: part.id,
          type: "function",
          function: { name: part.name, arguments: JSON.stringify(part.input ?? {}) },
        }));
      out.push({
        role: "assistant",
        content: textOf(message.content) || null,
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      });
      continue;
    }

    // Повідомлення від user: кожен результат кнопки стає окремим повідомленням "tool",
    // а звичайний текст лишається повідомленням "user"
    for (const part of message.content) {
      if (part.type !== "tool_result") continue;
      const content = typeof part.content === "string" ? part.content : JSON.stringify(part.content);
      out.push({
        role: "tool",
        tool_call_id: part.tool_use_id,
        content: part.is_error ? `ERROR: ${content}` : content,
      });
    }
    const text = textOf(message.content);
    if (text) out.push({ role: "user", content: text });
  }
  return out;
}

// «Рідний» формат Ollama — майже як OpenAI, але параметри кнопки там об'єкт, а не JSON-рядок
export function toOllama(req: Req): any[] {
  return toOpenAI(req).map((message) => {
    if (!message.tool_calls) return message;
    return {
      ...message,
      content: message.content ?? "",
      tool_calls: message.tool_calls.map((call: any) => ({
        ...call,
        function: { name: call.function.name, arguments: JSON.parse(call.function.arguments) },
      })),
    };
  });
}

// Відповідь Ollama → формат OpenAI → формат Anthropic
export function fromOllama(data: any): Reply {
  const message = data?.message ?? {};
  const toolCalls = (message.tool_calls ?? []).map((call: any, i: number) => ({
    id: call.id || `call_${Date.now().toString(36)}_${i}`, // Ollama не завжди дає id — придумуємо свій
    function: { name: call.function?.name, arguments: JSON.stringify(call.function?.arguments ?? {}) },
  }));
  return fromOpenAI({
    choices: [{ message: { content: message.content, tool_calls: toolCalls } }],
    usage: { prompt_tokens: data?.prompt_eval_count ?? 0, completion_tokens: data?.eval_count ?? 0 },
  });
}

// Відповідь у форматі OpenAI → формат Anthropic, який розуміє код уроку
export function fromOpenAI(data: any): Reply {
  const message = data?.choices?.[0]?.message ?? {};
  const content: Part[] = [];

  // Деякі моделі «думають уголос» у <think>…</think> — уроку потрібна лише відповідь
  const text = String(message.content ?? "")
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .trim();
  if (text) content.push({ type: "text", text });

  for (const call of message.tool_calls ?? []) {
    let input: any = {};
    try {
      input = JSON.parse(call.function?.arguments || "{}");
    } catch {
      input = {}; // модель написала зламаний JSON — передаємо порожні параметри
    }
    const id = call.id || `call_${Math.random().toString(36).slice(2, 10)}`;
    content.push({ type: "tool_use", id, name: call.function?.name, input });
  }

  const usage = {
    input_tokens: data?.usage?.prompt_tokens ?? 0,
    output_tokens: data?.usage?.completion_tokens ?? 0,
  };
  const stop_reason = content.some((part) => part.type === "tool_use") ? "tool_use" : "end_turn";
  return { content, stop_reason, usage, cost: 0 };
}
