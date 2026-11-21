import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { compileContext } from "../src/context-compiler.js";
import type { FileStat, DependencyInfo } from "../src/types.js";

describe("task-aware context compiler", () => {
  it("selects relevant files and dependencies but not unrelated callers", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "context-compiler-"));
    try {
      const names = ["PaymentClient.ts", "RetryPolicy.ts", "PaymentController.ts"];
      const contents = [
        "export class PaymentClient { retryPayment() {} }",
        "export class RetryPolicy {}",
        "export class PaymentController {}",
      ];
      await Promise.all(names.map((name, index) => writeFile(path.join(root, name), contents[index])));
      const files: FileStat[] = names.map(name => ({
        path: name, extension: ".ts", bytes: 100, estimatedTokens: 10, isGenerated: false,
      }));
      const graph: DependencyInfo[] = [
        { file: names[0], imports: [names[1]], importedBy: [names[2]] },
        { file: names[1], imports: [], importedBy: [names[0]] },
        { file: names[2], imports: [names[0]], importedBy: [] },
      ];
      const result = await compileContext("Add retry support to the payment client", root, files, graph);
      expect(result.selectedFiles).toContain(names[0]);
      expect(result.selectedFiles).toContain(names[1]);
      expect(result.selectedFiles).not.toContain(names[2]);
      expect(result.context.totalTokens).toBe(20);
    } finally {
      await rm(root, {recursive: true, force: true});
    }
  });
  it("rejects empty tasks", async () => {
    await expect(compileContext("the and", ".", [], [])).rejects.toThrow();
  });
  it("returns empty context for unmatched tasks", async () => {
    const result = await compileContext("quantum banana", ".", [], []);
    expect(result.selectedFiles).toEqual([]);
    expect(result.context.totalTokens).toBe(0);
  });
});
