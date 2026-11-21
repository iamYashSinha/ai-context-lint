import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
