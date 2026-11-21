import type Anthropic from "@anthropic-ai/sdk";
import type { Model, ModelReply } from "./types.ts";

/**
 * A fake model that returns pre-written replies, like mocking fetch in a frontend test.
 * It lets you see the loop mechanics for free and deterministically.
 */
let seq = 0;
const toolUse = (name: string, input: Record<string, unknown>) =>
  ({ type: "tool_use", id: `toolu_stub_${++seq}`, name, input }) as unknown as Anthropic.ContentBlock;
const text = (t: string) => ({ type: "text", text: t, citations: null }) as unknown as Anthropic.ContentBlock;
const reply = (content: Anthropic.ContentBlock[], stop: Anthropic.StopReason): ModelReply =>
  ({ content, stop_reason: stop, usage: { input_tokens: 0, output_tokens: 0 } }) as unknown as ModelReply;

export const SCRIPTS: Record<string, ModelReply[]> = {
  // A well-behaved agent: look around, read the file, answer.
  normal: [
    reply([text("Подивлюсь, що є в робочій папці."), toolUse("list_files", { dir: "." })], "tool_use"),
    reply([toolUse("read_file", { path: "notes/todo.md" })], "tool_use"),
    reply([text("У списку 3 задачі; найважливіша — «полагодити форму входу».")], "end_turn"),
  ],
  // A confused agent that never stops calling tools. Only maxTurns saves you.
  runaway: Array.from({ length: 50 }, () => reply([toolUse("list_files", { dir: "." })], "tool_use")),
  // An agent that tries to write outside the workspace. Only safePath saves you.
  escape: [
    reply([toolUse("write_file", { path: "../../outside.txt", contents: "hello" })], "tool_use"),
    reply(
      [text("Я попросив записати outside.txt. Що з цього вийшло — вирішив код інструмента, не я.")],
      "end_turn",
    ),
  ],
};

export function stubModel(script: keyof typeof SCRIPTS | string): Model {
  const replies = SCRIPTS[script];
  if (!replies) throw new Error(`unknown script: ${script}`);
  let i = 0;
  return async () => {
    const r = replies[Math.min(i, replies.length - 1)];
    i++;
    return r;
  };
}
