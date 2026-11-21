import Anthropic from "@anthropic-ai/sdk";
import type { Model } from "./types.ts";

/**
 * The real model. Same interface as the stub — the loop does not know the difference.
 * Needs ANTHROPIC_API_KEY (put it in .env, never in code or chat).
 */
export function anthropicModel(model = process.env.MODEL ?? "claude-haiku-5-5"): Model {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment
  return async ({ system, messages, tools }) =>
    client.messages.create({ model, max_tokens: 16000, system, messages, tools });
}

/** Haiku 5.5 list price per 1M tokens (input / output), for a rough cost line. */
export const HAIKU_PRICE = { input: 0.1, output: 0.5 };
