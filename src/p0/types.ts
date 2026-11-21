import type Anthropic from "@anthropic-ai/sdk";

/** What the loop sends to a model on every turn. Same shape as the Messages API request. */
export type ModelRequest = {
  system: string;
  messages: Anthropic.MessageParam[];
  tools: Anthropic.Tool[];
};

/** What the loop needs back. A real Anthropic.Message satisfies this; so does our stub. */
export type ModelReply = Pick<Anthropic.Message, "content" | "stop_reason" | "usage">;

/** A model is just an async function. Swapping stub ↔ Haiku is swapping this function. */
export type Model = (req: ModelRequest) => Promise<ModelReply>;

/** A tool = a description the model reads + a function our code runs. */
export type ToolImpl = {
  def: Anthropic.Tool;
  run: (input: unknown) => Promise<string>;
};
