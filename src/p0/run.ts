import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runAgent } from "./loop.ts";
import { makeTools } from "./tools.ts";
import { stubModel } from "./stubModel.ts";
import { anthropicModel, HAIKU_PRICE } from "./anthropicModel.ts";

// Usage:
//   npm run p0 -- --model stub --script normal|runaway|escape
//   npm run p0 -- --model haiku --task "..."
const arg = (name: string, dflt: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : dflt;
};

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "../..");
if (existsSync(path.join(projectRoot, ".env"))) process.loadEnvFile(path.join(projectRoot, ".env"));

const which = arg("model", "stub");
const workspace = path.join(projectRoot, "sandbox");
const model = which === "stub" ? stubModel(arg("script", "normal")) : anthropicModel();

const result = await runAgent({
  model,
  system:
    "Ти помічник, що працює з файлами в робочій папці. Спершу подивись, що там є, потім відповідай коротко українською.",
  task: arg("task", "Що в моєму списку справ і що найважливіше?"),
  tools: makeTools(workspace, { allowWrite: arg("write", "yes") === "yes" }),
  maxTurns: Number(arg("max-turns", "6")),
  onEvent: (e) => {
    if (e.type === "model") {
      console.log(
        `\n[хід ${e.turn}] модель: stop=${e.stopReason}` +
          (e.toolCalls.length ? `, хоче викликати: ${e.toolCalls.join(", ")}` : ""),
      );
      if (e.text) console.log(`  «${e.text}»`);
    } else if (e.type === "tool") {
      console.log(
        `  → ${e.name}(${JSON.stringify(e.input)}) ${e.ok ? "ok" : "ПОМИЛКА"}: ${e.output.split("\n").slice(0, 3).join(" | ")}`,
      );
    }
  },
});

console.log(
  `\nЗупинка: ${result.stoppedBy}, ходів: ${result.turns}, токени: ${result.usage.input} вхід / ${result.usage.output} вихід`,
);
if (which !== "stub") {
  const usd = (result.usage.input * HAIKU_PRICE.input + result.usage.output * HAIKU_PRICE.output) / 1e6;
  console.log(`Приблизна вартість: $${usd.toFixed(5)}`);
}
