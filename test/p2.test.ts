import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { loadTasks, searchTasks } from "../src/p2/tracker.ts";

test("search by label and status", async () => {
  const tasks = await loadTasks(path.resolve("tracker/tasks"));
  assert.deepEqual(
    searchTasks(tasks, { label: "mini-agent", status: "todo" }).map((t) => t.id),
    ["T-1", "T-2"],
  );
  assert.equal(searchTasks(tasks, { label: "docs" }).length, 1);
});
