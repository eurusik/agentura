import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { ToolImpl } from "./types.ts";

/**
 * The model chooses the path, so the path is untrusted input.
 * Resolve it inside `root` and refuse anything that escapes (../, absolute paths).
 */
export function safePath(root: string, p: string): string {
  const full = path.resolve(root, p);
  const rel = path.relative(root, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`path outside the workspace is not allowed: ${p}`);
  }
  return full;
}

export function makeTools(root: string, opts: { allowWrite: boolean }): ToolImpl[] {
  const listFiles: ToolImpl = {
    def: {
      name: "list_files",
      description: "List files and folders in a directory of the workspace. Use '.' for the workspace root.",
      input_schema: { type: "object", properties: { dir: { type: "string" } }, required: ["dir"] },
    },
    run: async (input) => {
      const { dir } = z.object({ dir: z.string() }).parse(input);
      const entries = await fs.readdir(safePath(root, dir), { withFileTypes: true });
      return entries.map((e) => (e.isDirectory() ? `${e.name}/` : e.name)).join("\n") || "(empty)";
    },
  };

  const readFile: ToolImpl = {
    def: {
      name: "read_file",
      description: "Read a text file from the workspace.",
      input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    },
    run: async (input) => {
      const { path: p } = z.object({ path: z.string() }).parse(input);
      return fs.readFile(safePath(root, p), "utf8");
    },
  };

  const writeFile: ToolImpl = {
    def: {
      name: "write_file",
      description: "Create or overwrite a text file in the workspace.",
      input_schema: {
        type: "object",
        properties: { path: { type: "string" }, contents: { type: "string" } },
        required: ["path", "contents"],
      },
    },
    run: async (input) => {
      const { path: p, contents } = z.object({ path: z.string(), contents: z.string() }).parse(input);
      const full = safePath(root, p);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, contents);
      return `wrote ${contents.length} chars to ${p}`;
    },
  };

  return opts.allowWrite ? [listFiles, readFile, writeFile] : [listFiles, readFile];
}
