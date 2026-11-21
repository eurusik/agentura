import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runAgent } from "../src/p0/loop.ts";
import { makeTools } from "../src/p0/tools.ts";
import { stubModel } from "../src/p0/stubModel.ts";

function workspace() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "p0-"));
  const ws = path.join(dir, "a", "b", "ws");
  mkdirSync(path.join(ws, "notes"), { recursive: true });
  writeFileSync(path.join(ws, "notes", "todo.md"), "- полагодити форму входу\n");
  return { dir, ws };
}

test("normal agent: looks, reads, answers and stops by itself", async () => {
  const { ws } = workspace();
  const r = await runAgent({
    model: stubModel("normal"),
    system: "",
    task: "?",
    tools: makeTools(ws, { allowWrite: true }),
  });
  assert.equal(r.stoppedBy, "done");
  assert.equal(r.turns, 3);
});

test("runaway agent: only maxTurns stops it", async () => {
  const { ws } = workspace();
  const r = await runAgent({
    model: stubModel("runaway"),
    system: "",
    task: "?",
    tools: makeTools(ws, { allowWrite: true }),
    maxTurns: 5,
  });
  assert.equal(r.stoppedBy, "max_turns");
  assert.equal(r.turns, 5);
});

test("escape attempt: write outside the workspace is refused and reported back as an error", async () => {
  const { dir, ws } = workspace();
  const events: string[] = [];
  const r = await runAgent({
    model: stubModel("escape"),
    system: "",
    task: "?",
    tools: makeTools(ws, { allowWrite: true }),
    onEvent: (e) => {
      if (e.type === "tool") events.push(`${e.name}:${e.ok}`);
    },
  });
  assert.deepEqual(events, ["write_file:false"]);
  assert.equal(existsSync(path.join(dir, "a", "outside.txt")), false);
  assert.equal(r.stoppedBy, "done");
});

test("read-only toolset: write_file simply does not exist for the model", async () => {
  const { ws } = workspace();
  const names = makeTools(ws, { allowWrite: false }).map((t) => t.def.name);
  assert.deepEqual(names, ["list_files", "read_file"]);
});
