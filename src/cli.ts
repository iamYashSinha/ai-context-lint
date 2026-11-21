#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import fs from "node:fs";
import { Command } from "commander";
import { scanRepository } from "./scanner.js";
import { analyzeFiles, analyzeContextHotspots } from "./analyzer.js";
import { printReport } from "./reporter.js";
import type { Report } from "./types.js";
import { buildDependencyGraph } from "./dependencies.js";
import { analyzeContext, analyzeCombinedContext } from "./context.js";
import { compileContext } from "./context-compiler.js";

const packageJson = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const program = new Command();
program
  .name("ai-context-lint")
  .description("Analyze repository context cost and noise for AI coding agents.")
  .version(packageJson.version)
  .argument("[path]", "repository path", ".")
  .option("--json", "output JSON")
  .option("--ci", "fail if configured thresholds are exceeded")
  .option("--max-tokens <number>", "maximum allowed token count")
  .option("--files <files...>", "analyze context for specific files")
  .option("--task <description>", "compile experimental task-specific context")
  .action(async (inputPath: string, options) => {
    if (options.task && options.files) throw new Error("--task and --files cannot be combined");
    const root = path.resolve(inputPath);
    const allFiles = await scanRepository(root);
    const dependencyGraph = await buildDependencyGraph(root, allFiles);
    const allContextAnalysis = analyzeContext(allFiles, dependencyGraph);
    const contextCompiler = options.task
      ? await compileContext(options.task, root, allFiles, dependencyGraph)
      : undefined;
    const selected = contextCompiler?.selectedFiles ?? options.files;
    const files = selected ? allFiles.filter(file => selected.includes(file.path)) : allFiles;
    const contextAnalysis = selected
      ? allContextAnalysis.filter(context => selected.includes(context.file))
      : allContextAnalysis;
    const combinedContext = contextCompiler?.context ??
      (options.files ? analyzeCombinedContext(options.files, allFiles, dependencyGraph) : undefined);
    const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
    const totalEstimatedTokens = files.reduce((sum, file) => sum + file.estimatedTokens, 0);
    const issues = [...analyzeFiles(files), ...analyzeContextHotspots(contextAnalysis)];
    const report: Report = {
      root, files, totalBytes, totalEstimatedTokens, issues,
      contextAnalysis, dependencyGraph, combinedContext, contextCompiler,
      scopes: contextCompiler && {
        files: "task-selection",
        combinedContext: "task-context",
        issues: "task-selection-with-repository-dependencies",
        contextAnalysis: "task-selection-with-repository-dependencies",
        dependencyGraph: "repository",
      },
    };
    const maxTokens = options.maxTokens === undefined ? undefined : Number(options.maxTokens);
    if (options.ci && maxTokens !== undefined) {
      if (!Number.isFinite(maxTokens) || maxTokens < 0) {
        console.error("--max-tokens must be a non-negative number");
        process.exit(1);
      }
      const budgetTokens = combinedContext?.totalTokens ?? report.totalEstimatedTokens;
      if (budgetTokens > maxTokens) {
        console.error(`CI check failed: ${budgetTokens} tokens exceeds the maximum of ${maxTokens} tokens.`);
        process.exit(1);
      }
    }
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    printReport(report);
  });
program.parseAsync().catch(error => { console.error(error); process.exit(1); });
