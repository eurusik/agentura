import type Anthropic from "@anthropic-ai/sdk";
import type { Model, ToolImpl } from "./types.ts";

export type StoppedBy = "done" | "max_turns" | "max_tokens" | "refusal";

export type LoopEvent =
  | { type: "request"; turn: number; messages: Anthropic.MessageParam[]; tools: string[] }
  | {
      type: "model";
      turn: number;
      stopReason: string | null;
      text: string;
      toolCalls: string[];
      content?: unknown;
    }
  | { type: "tool"; turn: number; name: string; input: unknown; ok: boolean; output: string };

export type RunResult = {
  text: string;
  turns: number;
  stoppedBy: StoppedBy;
  usage: { input: number; output: number };
};

/**
 * The whole agent: ask the model → run the tools it asked for → give it the results → repeat.
 * Everything "autonomous" in the handbook is this loop plus code around it.
 */
export async function runAgent(opts: {
  model: Model;
  system: string;
  task: string;
  tools: ToolImpl[];
  maxTurns?: number;
  /** Lab switch: false = do not keep the conversation history (to see what breaks). */
  keepHistory?: boolean;
  onEvent?: (e: LoopEvent) => void;
}): Promise<RunResult> {
  const keepHistory = opts.keepHistory ?? true;
  const maxTurns = opts.maxTurns ?? 8;
  const byName = new Map(opts.tools.map((t) => [t.def.name, t]));
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: opts.task }];
  const usage = { input: 0, output: 0 };
  let lastText = "";

  for (let turn = 1; turn <= maxTurns; turn++) {
    opts.onEvent?.({
      type: "request",
      turn,
      messages: structuredClone(messages),
      tools: opts.tools.map((t) => t.def.name),
    });
    const reply = await opts.model({ system: opts.system, messages, tools: opts.tools.map((t) => t.def) });
    usage.input += reply.usage?.input_tokens ?? 0;
    usage.output += reply.usage?.output_tokens ?? 0;

    // Keep the FULL assistant content (text, tool calls, thinking) — the model needs its own history.
    if (keepHistory) messages.push({ role: "assistant", content: reply.content });

    lastText = reply.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("\n")
      .trim();
    const toolUses = reply.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    opts.onEvent?.({
      type: "model",
      turn,
      stopReason: reply.stop_reason,
      text: lastText,
      toolCalls: toolUses.map((t) => t.name),
      content: reply.content,
    });

    if (reply.stop_reason === "refusal") return { text: lastText, turns: turn, stoppedBy: "refusal", usage };
    if (reply.stop_reason === "max_tokens")
      return { text: lastText, turns: turn, stoppedBy: "max_tokens", usage };
    if (toolUses.length === 0) return { text: lastText, turns: turn, stoppedBy: "done", usage };

    // Run every requested tool. Errors go back to the model as data, not as exceptions.
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const call of toolUses) {
      const tool = byName.get(call.name);
      let output: string;
      let ok = true;
      if (!tool) {
        ok = false;
        output = `unknown tool: ${call.name}`;
      } else {
        try {
          output = await tool.run(call.input);
        } catch (err) {
          ok = false;
          output = err instanceof Error ? err.message : String(err);
        }
      }
      opts.onEvent?.({ type: "tool", turn, name: call.name, input: call.input, ok, output });
      results.push({ type: "tool_result", tool_use_id: call.id, content: output, is_error: !ok });
    }
    // All results of one turn go back in ONE user message.
    if (keepHistory) messages.push({ role: "user", content: results });
  }

  return { text: lastText, turns: maxTurns, stoppedBy: "max_turns", usage };
}
