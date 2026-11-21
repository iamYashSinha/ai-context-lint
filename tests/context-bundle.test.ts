import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { renderContextBundle } from "../src/context-bundle.js";
import type { ContextCompilerResult } from "../src/types.js";

let root: string;
beforeEach(async () => { root = await mkdtemp(path.join(os.tmpdir(), "context-bundle-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

function result(files: string[], selectedFiles: string[] = []): ContextCompilerResult {
  return {
    task: "Explain the code\n```\n# Still inside the task",
    selectedFiles,
    candidates: selectedFiles.map(file => ({ file, score: 10, reasons: ["filename: code"] })),
    context: { selectedFiles, contextFiles: files, ownTokens: 0, dependencyTokens: 0, totalTokens: 0 },
  };
}

it("renders each path once in sorted order and protects fences and filenames", async () => {
  const unusual = "z [source]`\n# name.ts";
  const code = "/*\n`````\n*/\nexport const name = 'unique marker';";
  await writeFile(path.join(root, unusual), code);
  await writeFile(path.join(root, "a.py"), "print('dependency')\n");

  const bundle = await renderContextBundle(root, result([unusual, "a.py", unusual], [unusual]));
  expect(bundle).toBe(await renderContextBundle(root, result(["a.py", unusual], [unusual])));
  expect(bundle).toContain("````text\nExplain the code\n```\n# Still inside the task\n````");
  expect(bundle).toContain('### `` "z [source]`\\n# name.ts" ``');
  expect(bundle).toContain("Compiler signals (score 10)");
  expect(bundle).toContain("Additional dependency included by the task compiler.");
  expect(bundle).toContain("```py\nprint('dependency')\n```");
  expect(bundle).toContain(`${"`".repeat(6)}ts\n${code}\n${"`".repeat(6)}`);
  expect(bundle.match(/unique marker/g)).toHaveLength(1);
  expect(bundle.indexOf("a.py")).toBeLessThan(bundle.indexOf("z [source]"));
});

it("renders an empty selection and rejects missing or out-of-repository sources", async () => {
  expect(await renderContextBundle(root, result([]))).toContain("No source files matched this task.");
  await expect(renderContextBundle(root, result(["missing.ts"]))).rejects.toThrow(/ENOENT/);
  await expect(renderContextBundle(root, result(["../outside.ts"]))).rejects.toThrow(/outside the repository/);
  await symlink(path.dirname(root), path.join(root, "external"));
  await expect(renderContextBundle(root, result(["external"]))).rejects.toThrow(/outside the repository/);
});
