import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";

/** Our tiny "Jira": one JSON file per task in tracker/tasks/. */
export const Task = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  labels: z.array(z.string()),
  status: z.enum(["todo", "in_progress", "review", "done"]),
});
export type Task = z.infer<typeof Task>;

export async function loadTasks(dir: string): Promise<Task[]> {
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  const tasks: Task[] = [];
  for (const f of files) tasks.push(Task.parse(JSON.parse(await fs.readFile(path.join(dir, f), "utf8"))));
  return tasks;
}

export function searchTasks(tasks: Task[], q: { label?: string; status?: Task["status"] }): Task[] {
  return tasks.filter(
    (t) => (!q.label || t.labels.includes(q.label)) && (!q.status || t.status === q.status),
  );
}
