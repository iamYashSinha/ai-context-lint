import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import type { Report } from "../src/types.js";

it("reports the same task context in text and JSON and labels repository import costs separately", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "context-report-"));
  try {
    await Promise.all([
      writeFile(path.join(root, "PaymentClient.ts"), "export interface PaymentClient {}"),
      writeFile(path.join(root, "Controller.ts"),
        "import type { PaymentClient } from './PaymentClient.js';\n" +
        "import { Logger } from './Logger.js';\nexport const handle = (client: PaymentClient) => Logger;"),
      writeFile(path.join(root, "Logger.ts"),
        "import './Controller.js';\nexport const Logger = {};"),
    ]);
    const run = (...args: string[]) => execFileSync(
      process.execPath, ["--import", "tsx", "src/cli.ts", root, ...args], { encoding: "utf8" },
    );
    const taskArgs = ["--task", "Change the payment client interface"];
    const report: Report = JSON.parse(run(...taskArgs, "--json"));
    const output = run(...taskArgs);
    const [taskContext, repositoryDiagnostics] = output.split(
      "Repository dependency diagnostics for task-selected files",
    );
    const context = report.combinedContext!;
    expect(report.scopes).toMatchObject({
      combinedContext: "task-context",
      contextAnalysis: "task-selection-with-repository-dependencies",
      dependencyGraph: "repository",
    });
    expect(context).toEqual(report.contextCompiler?.context);
    expect(context.contextFiles).toEqual(expect.arrayContaining(["PaymentClient.ts", "Controller.ts"]));
    expect(context.contextFiles).not.toContain("Logger.ts");
    expect(taskContext).toContain("Task-specific context");
    expect(taskContext).toContain(`Unique context:    ${context.totalTokens.toLocaleString()}`);
    expect(taskContext).toContain(`Context files:     ${context.contextFiles.length}`);
    expect(taskContext).not.toContain("Logger.ts");
    expect(repositoryDiagnostics).toContain("Logger.ts");
    expect(report.contextAnalysis.find(entry => entry.file === "Controller.ts")?.transitiveFiles)
      .toContain("Logger.ts");
    expect(report.dependencyGraph.map(entry => entry.file)).toContain("Logger.ts");
    expect(JSON.parse(run("--json"))).not.toHaveProperty("scopes");
    expect(JSON.parse(run("--files", "Controller.ts", "--json")).combinedContext.contextFiles)
      .toContain("Logger.ts");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("exports exactly the task context including shared caller dependencies and preserves stdout", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "context-export-"));
  try {
    const sources = {
      "PaymentClient.ts": "export interface PaymentClient {}",
      "Adapter.ts": "import type { PaymentClient } from './PaymentClient.js';\n" +
        "import type { PaymentResult } from './shared.js';\n" +
        "export const adapt = (client: PaymentClient): PaymentResult => ({});",
      "Controller.ts": "import type { PaymentClient } from './PaymentClient.js';\n" +
        "import type { PaymentResult } from './shared.js';\nimport './logger.js';\n" +
        "export const handle = (client: PaymentClient): PaymentResult => ({});",
      "shared.ts": "export interface PaymentResult {}",
      "logger.ts": "export const Logger = {};",
    };
    await Promise.all(Object.entries(sources).map(([file, source]) => writeFile(path.join(root, file), source)));
    const taskArgs = ["--task", "Change the payment client result interface"];
    const run = (...args: string[]) => spawnSync(
      process.execPath, ["--import", "tsx", "src/cli.ts", root, ...args], { encoding: "utf8" },
    );
    const destination = path.join(root, "context bundle.md");
    const baseline = run(...taskArgs, "--json");
    const exported = run(...taskArgs, "--json", "--output", destination);
    expect(exported.status, exported.stderr).toBe(0);
    expect(exported.stdout).toBe(baseline.stdout);

    const report: Report = JSON.parse(exported.stdout);
    const bundle = await readFile(destination, "utf8");
    const headings = [...bundle.matchAll(/^### ` (.+) `$/gm)].map(match => JSON.parse(match[1]));
    expect(headings).toEqual([...report.combinedContext!.contextFiles].sort());
    expect(report.contextCompiler!.selectedFiles).not.toContain("shared.ts");
    expect(headings).toContain("shared.ts");
    expect(headings).not.toContain("logger.ts");
    expect(bundle).toContain("task-relevant import: shared.ts");
    for (const file of headings as Array<keyof typeof sources>) {
      expect(bundle.split(sources[file])).toHaveLength(2);
    }

    const textDestination = path.join(root, "text report bundle.md");
    const text = run(...taskArgs, "--output", textDestination);
    expect(text.status, text.stderr).toBe(0);
    expect(text.stdout).toBe(run(...taskArgs).stdout);
    expect(await readFile(textDestination, "utf8")).toBe(bundle);

    const missingParent = path.join(root, "missing", "context.md");
    for (const [args, message] of [
      [["--output", destination], /--output requires --task/],
      [[...taskArgs, "--files", "shared.ts", "--output", destination], /--task and --files/],
      [[...taskArgs, "--output=-"], /--output requires a file path/],
      [[...taskArgs, "--output", destination], /Could not export Markdown bundle.*EEXIST/],
      [[...taskArgs, "--output", missingParent], /Could not export Markdown bundle.*ENOENT/],
      [[...taskArgs, "--ci", "--max-tokens", "0", "--output", path.join(root, "blocked.md")], /CI check failed/],
    ] as const) {
      const failed = run(...args);
      expect(failed.status).toBe(1);
      expect(failed.stdout).toBe("");
      expect(failed.stderr).toMatch(message);
    }
    expect(await readFile(destination, "utf8")).toBe(bundle);
    await expect(readFile(path.join(root, "blocked.md"))).rejects.toThrow(/ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 20_000);
