import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { compileContext } from "../src/context-compiler.js";
import { buildDependencyGraph } from "../src/dependencies.js";
import type { FileStat } from "../src/types.js";

it("follows relevant named bindings for interface changes and counts shared files once", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "caller-imports-"));
  const sources = {
    "PaymentClient.ts": "export interface PaymentClient {}",
    "Controller.ts": [
      "import type { PaymentClient } from './PaymentClient.js';",
      "import { PaymentResult as Result, PaymentUnused } from './shared.js';",
      "import { DormantResult } from './dormant.js';",
      "import { PaymentLogger } from './logger.js';",
      "export const handle = (client: PaymentClient): Result => { PaymentLogger(); return {}; };",
    ].join("\n"),
    "Adapter.ts": [
      "import type { PaymentClient } from './PaymentClient.js';",
      "import { type PaymentResult } from './shared.js';",
      "export const adapt = (client: PaymentClient): PaymentResult => ({});",
    ].join("\n"),
    "shared.ts": [
      "import './Controller.js';",
      "import './logger.js';",
      "export interface PaymentResult {}",
      "export interface PaymentUnused {}",
    ].join("\n"),
    "dormant.ts": "export interface DormantResult {}",
    "logger.ts": "export function PaymentLogger() {}",
  };
  try {
    const files: FileStat[] = Object.entries(sources).map(([name, source], index) => ({
      path: name, extension: ".ts", bytes: source.length, estimatedTokens: index + 1, isGenerated: false,
    }));
    await Promise.all(Object.entries(sources).map(([name, source]) => writeFile(path.join(root, name), source)));
    const graph = await buildDependencyGraph(root, files);
    const result = await compileContext("Change the payment client result interface", root, files, graph);
    expect(result.selectedFiles).toEqual(["PaymentClient.ts", "Controller.ts", "Adapter.ts"]);
    expect(result.context.contextFiles.toSorted()).toEqual(
      ["Adapter.ts", "Controller.ts", "PaymentClient.ts", "shared.ts"],
    );
    expect(result.context).toMatchObject({ ownTokens: 6, dependencyTokens: 4, totalTokens: 10 });
    for (const caller of ["Controller.ts", "Adapter.ts"]) {
      expect(result.candidates.find(candidate => candidate.file === caller)?.reasons)
        .toContain("task-relevant import: shared.ts");
    }

    const ordinary = await compileContext("Explain the payment client", root, files, graph);
    expect(ordinary.selectedFiles).toEqual(["PaymentClient.ts"]);
    expect(ordinary.context.contextFiles).toEqual(["PaymentClient.ts"]);
    expect(ordinary.context.totalTokens).toBe(1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
