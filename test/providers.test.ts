import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import {
  toOpenAI,
  fromOpenAI,
  toOpenAITools,
  toOllama,
  fromOllama,
  detect,
  callModel,
} from "../lab/providers.ts";

const history = [
  { role: "user" as const, content: "Що в моєму списку справ?" },
  {
    role: "assistant" as const,
    content: [
      { type: "text", text: "Гляну." },
      { type: "tool_use", id: "t1", name: "read_file", input: { path: "notes/todo.md" } },
    ],
  },
  {
    role: "user" as const,
    content: [{ type: "tool_result", tool_use_id: "t1", content: "нема файлу", is_error: true }],
  },
];

test("Anthropic history → OpenAI messages", () => {
  const out = toOpenAI({ system: "будь коротким", messages: history });
  assert.deepEqual(out[0], { role: "system", content: "будь коротким" });
  assert.equal(out[2].tool_calls[0].function.name, "read_file");
  assert.equal(out[2].tool_calls[0].function.arguments, JSON.stringify({ path: "notes/todo.md" }));
  assert.deepEqual(out[3], { role: "tool", tool_call_id: "t1", content: "ERROR: нема файлу" });
});

test("OpenAI reply → Anthropic blocks (tool call, broken JSON, <think>)", () => {
  const r = fromOpenAI({
    choices: [
      {
        message: {
          content: "<think>хм</think>Зараз",
          tool_calls: [
            { id: "c1", function: { name: "list_files", arguments: '{"dir":"."}' } },
            { id: "c2", function: { name: "read_file", arguments: "{oops" } },
          ],
        },
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 3 },
  });
  assert.deepEqual(r.content[0], { type: "text", text: "Зараз" });
  assert.deepEqual(r.content[1], { type: "tool_use", id: "c1", name: "list_files", input: { dir: "." } });
  assert.deepEqual(r.content[2].input, {});
  assert.equal(r.stop_reason, "tool_use");
  assert.equal(r.usage.input_tokens, 10);
  assert.equal(toOpenAITools([{ name: "x", input_schema: { type: "object" } }])[0].type, "function");
});

test("Ollama native format: arguments are objects both ways", () => {
  const out = toOllama({ messages: history });
  assert.deepEqual(out[1].tool_calls[0].function.arguments, { path: "notes/todo.md" });
  const r = fromOllama({
    message: { content: "", tool_calls: [{ function: { name: "list_files", arguments: { dir: "." } } }] },
    prompt_eval_count: 7,
    eval_count: 2,
  });
  assert.equal(r.content[0].type, "tool_use");
  assert.deepEqual(r.content[0].input, { dir: "." });
  assert.ok(r.content[0].id);
  assert.equal(r.usage.input_tokens, 7);
});

test("end to end with a fake OpenAI-compatible server", async () => {
  let seen: any;
  const srv = createServer(async (req, res) => {
    let raw = "";
    for await (const c of req) raw += c;
    seen = { url: req.url, auth: req.headers.authorization, body: JSON.parse(raw) };
    res.end(
      JSON.stringify({
        choices: [{ message: { content: "Три задачі." } }],
        usage: { prompt_tokens: 5, completion_tokens: 2 },
      }),
    );
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  const port = (srv.address() as any).port;
  const saved = { ...process.env };
  delete process.env.ANTHROPIC_API_KEY;
  Object.assign(process.env, {
    OPENAI_BASE_URL: `http://127.0.0.1:${port}/v1`,
    OPENAI_API_KEY: "test-key",
    OPENAI_MODEL: "tiny",
  });
  try {
    const s = await detect(true);
    assert.equal(s.provider, "openai");
    const r = await callModel({
      messages: history,
      tools: [{ name: "read_file", input_schema: { type: "object" } }],
    });
    assert.equal(seen.url, "/v1/chat/completions");
    assert.equal(seen.auth, "Bearer test-key");
    assert.equal(seen.body.model, "tiny");
    assert.deepEqual(r.content, [{ type: "text", text: "Три задачі." }]);
    delete process.env.OPENAI_API_KEY;
    assert.match((await detect(true)).problem ?? "", /OPENAI_API_KEY/);
  } finally {
    process.env = saved;
    srv.close();
  }
});
