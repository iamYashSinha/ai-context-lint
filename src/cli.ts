#!/usr/bin/env node

import path from "node:path";
import process from "node:process";

import { Command } from "commander";

import { scanRepository } from "./scanner.js";
import { analyzeFiles, analyzeContextHotspots } from "./analyzer.js";
import { printReport } from "./reporter.js";
import type { Report } from "./types.js";
import { buildDependencyGraph } from "./dependencies.js";
import { analyzeContext, analyzeCombinedContext } from "./context.js";

const program = new Command();

program
  .name("ai-context-lint")
  .description(
    "Analyze repository context cost and noise for AI coding agents."
  )
  .version("0.1.1")
  .argument("[path]", "repository path", ".")
  .option("--json", "output JSON")
  .option("--files <files...>", "analyze context for specific files")
  .action(async (inputPath: string, options) => {
    const root = path.resolve(inputPath);

    const allFiles = await scanRepository(root);

    const dependencyGraph = await buildDependencyGraph(
        root,
        allFiles
    );

    const allContextAnalysis = analyzeContext(
        allFiles,
        dependencyGraph
    );

    const files = options.files
      ? allFiles.filter((file) => options.files.includes(file.path))
    : allFiles;

    const contextAnalysis = options.files
        ? allContextAnalysis.filter((context) =>
            options.files.includes(context.file)
        )
    : allContextAnalysis;  
    
    const combinedContext = options.files
        ? analyzeCombinedContext(options.files, allFiles, dependencyGraph)
        : undefined;

    const totalBytes = files.reduce(
      (sum, file) => sum + file.bytes,
      0
    );

    const totalEstimatedTokens = files.reduce(
      (sum, file) => sum + file.estimatedTokens,
      0
    );

    const issues = [
      ...analyzeFiles(files),
      ...analyzeContextHotspots(contextAnalysis),
    ];

    const report: Report = {
      root,
      files,
      totalBytes,
      totalEstimatedTokens,
      issues,
      contextAnalysis,
      dependencyGraph,
      combinedContext,
    };

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    printReport(report);
  });

program.parseAsync().catch((error) => {
  console.error(error);
  process.exit(1);
});