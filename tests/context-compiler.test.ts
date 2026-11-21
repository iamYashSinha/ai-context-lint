import { describe, it, expect } from "vitest";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { compileContext } from "../src/context-compiler.js";
import { buildDependencyGraph } from "../src/dependencies.js";
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
  it("includes relevant direct callers without pulling in caller-only imports", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "context-interface-"));
    try {
      const names = [
        "PaymentClient.ts", "PaymentController.ts", "UnrelatedController.ts",
        "RetryPolicy.ts", "Logger.ts", "LogSink.ts", "Backoff.ts",
      ];
      const contents = [
        "export interface PaymentClient { retryPayment(): void }",
        "import type { PaymentClient } from './PaymentClient.js'; export function handle(client: PaymentClient) { client.retryPayment(); }",
        "export class UnrelatedController {}",
        "export class RetryPolicy {}",
        "export class Logger {}",
        "export class LogSink {}",
        "export class Backoff {}",
      ];
      await Promise.all(names.map((name, index) => writeFile(path.join(root, name), contents[index])));
      const files: FileStat[] = names.map(name => ({
        path: name, extension: ".ts", bytes: 100, estimatedTokens: 10, isGenerated: false,
      }));
      const graph: DependencyInfo[] = [
        { file: names[0], imports: [names[3]], importedBy: [names[1], names[2]] },
        { file: names[1], imports: [names[0], names[3], names[4]], importedBy: [names[2]] },
        { file: names[2], imports: [names[0], names[1]], importedBy: [] },
        { file: names[3], imports: [names[6]], importedBy: [names[0], names[1]] },
        { file: names[4], imports: [names[5]], importedBy: [names[1]] },
        { file: names[5], imports: [], importedBy: [names[4]] },
        { file: names[6], imports: [], importedBy: [names[3]] },
      ];
      const task = "Change the payment client interface";
      const result = await compileContext(task, root, files, graph);
      const expected = [names[0], names[1], names[3], names[6]];
      expect(result.selectedFiles).toEqual(expected);
      expect(new Set(result.context.contextFiles)).toEqual(new Set(expected));
      expect(result.context.contextFiles).toHaveLength(expected.length);
      expect(result.context).toMatchObject({ ownTokens: 40, dependencyTokens: 0, totalTokens: 40 });
      expect(result.candidates.find(candidate => candidate.file === names[1])?.reasons)
        .toContain("direct caller of: PaymentClient.ts (interface change)");

      // If a root independently reaches the caller, follow its imports as usual.
      graph[3].imports.push(names[1]);
      graph[1].importedBy.push(names[3]);
      const withRootPath = await compileContext(task, root, files, graph);
      const expectedWithRootPath = names.filter(name => name !== names[2]);
      expect(withRootPath.selectedFiles).toEqual(expectedWithRootPath);
      expect(new Set(withRootPath.context.contextFiles)).toEqual(new Set(expectedWithRootPath));
      expect(withRootPath.context.contextFiles).toHaveLength(expectedWithRootPath.length);
      expect(withRootPath.context.totalTokens).toBe(60);
    } finally {
      await rm(root, {recursive: true, force: true});
    }
  });
  it("scores payment implementation without treating a fixture root as a test signal", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "context-testing-"));
    const client = "test-repo/src/payment/PaymentClient.ts";
    const service = "test-repo/src/payment/PaymentService.ts";
    const namedTest = "tests/PaymentService.spec.ts";
    const importingTest = "tests/smoke.ts";
    const unrelated = "tests/cli.test.ts";
    const sources = {
      [client]: "export class PaymentClient {}",
      [service]: "import './PaymentClient.js'; export class PaymentService {}",
      [namedTest]: "export const cases = [];",
      [importingTest]: "import '../test-repo/src/payment/PaymentService.js';",
      [unrelated]: "// Test the CLI with a payment-related input",
    };
    try {
      const files: FileStat[] = Object.entries(sources).map(([name, source]) => ({
        path: name, extension: ".ts", bytes: source.length, estimatedTokens: 10, isGenerated: false,
      }));
      for (const [name, source] of Object.entries(sources)) {
        await mkdir(path.dirname(path.join(root, name)), { recursive: true });
        await writeFile(path.join(root, name), source);
      }
      const graph = await buildDependencyGraph(root, files);
      const task = "write a payment related test";
      const result = await compileContext(task, root, files, graph);
      expect(result.candidates.find(candidate => candidate.file === client)?.reasons)
        .not.toContain("path: test");
      expect(result.candidates.find(candidate => candidate.file === client)).toMatchObject({
        score: 11,
        reasons: [
          "filename: payment", "source: payment", "intent: testing (implementation path matches topic)",
        ],
      });
      expect(result.candidates.find(candidate => candidate.file === importingTest)?.reasons)
        .toContain(`intent: testing (imports ${service})`);
      expect(result.selectedFiles).toEqual([client, service, namedTest, importingTest]);
      expect(result.context.totalTokens).toBe(40);

      for (const [description, intent] of [
        ["Fix the payment bug", "bug fix"],
        ["Refactor payment", "refactor"],
        ["Explain payment", "explanation"],
      ]) {
        const focused = await compileContext(description, root, files, graph);
        expect(focused.selectedFiles).toEqual([client, service]);
        expect(focused.candidates.find(candidate => candidate.file === client)?.reasons)
          .toContain(`intent: ${intent} (implementation path matches topic)`);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
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
