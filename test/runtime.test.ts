// Спільні частини пісочниці уроків: міні-git і імітація MCP
import { test } from "node:test";
import assert from "node:assert/strict";

// Модулі пісочниці написані на JS для браузера, без типів, тож вантажимо їх як any
const load = (path: string): Promise<any> => import(path);
const { createWorkspace } = await load("../lab/public/runtime/workspace.js");
const { createRepo, createGitTools } = await load("../lab/public/runtime/git.js");
const { createMcp } = await load("../lab/public/runtime/mcp.js");

function setup() {
  const events: any[] = [];
  const report = (event: any) => events.push(event);
  const workspace = createWorkspace(
    { "src/config.js": 'export const title = "A";\nexport const lang = "uk";\n' },
    report,
  );
  const repo = createRepo(workspace, report);
  const lastGit = () => events.filter((e) => e.type === "git").at(-1);
  return { workspace, repo, report, events, lastGit };
}

test("git: гілка, коміт, merge request і злиття", () => {
  const { workspace, repo, lastGit } = setup();
  assert.throws(() => repo.openMr("t", "d"), /з окремої гілки/);

  repo.branch("agent/T-5");
  assert.throws(() => repo.commit("порожньо", "агент"), /немає змін/);

  workspace.write("/work/src/config.js", 'export const title = "B";\nexport const lang = "uk";\n');
  assert.deepEqual(repo.status().changed, ["src/config.js"]);
  repo.commit("T-5: назва", "агент");
  assert.deepEqual(repo.status().changed, []);

  repo.openMr("T-5: назва", "опис");
  const mr = lastGit().mrs[0];
  assert.equal(mr.status, "open");
  // Дифф: спершу зниклий рядок, потім новий; незмінений рядок lang не показуємо
  assert.deepEqual(mr.diff["src/config.js"], ['− export const title = "A";', '+ export const title = "B";']);

  repo.merge("!1", "людина");
  const main = lastGit().branches.find((b: any) => b.name === "main");
  assert.deepEqual(
    main.commits.map((c: any) => c.message),
    ["Початок проєкту", "T-5: назва"],
  );
  assert.throws(() => repo.merge("!1", "людина"), /уже злитий/);
});

test("mcp: сервер сам каже, які в нього інструменти, і сам їх виконує", async () => {
  const { repo, report, events } = setup();
  const gitTools = createGitTools(repo, () => {}, { branch: "branch" });
  const mcp = createMcp({ git: { tools: gitTools } }, report);

  const git = await mcp.connect("git");
  const names = (await git.listTools()).map((def: any) => def.name);
  assert.ok(names.includes("branch"));

  assert.match(await git.callTool("branch", { name: "agent/T-1" }), /створено гілку agent\/T-1/);
  const call = events.find((e) => e.type === "tool" && e.server === "git");
  assert.equal(call.name, "branch");
  assert.equal(call.ok, true);

  await assert.rejects(git.callTool("nope", {}), /немає інструмента nope/);
  await assert.rejects(mcp.connect("slack"), /сервера slack немає/);
});
