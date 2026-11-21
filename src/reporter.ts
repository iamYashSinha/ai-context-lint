import path from "node:path";

import type { Report, DependencyInfo, CombinedContextAnalysis } from "./types.js";


function printDependencyTree(
    file: string,
    dependencies: DependencyInfo[],
    prefix = "",
    ancestors = new Set<string>()
  ): void {
    const node = dependencies.find(
      (dependency) => dependency.file === file
    );
  
    if (!node) {
      return;
    }
  
    ancestors.add(file);
    for (let i = 0; i < node.imports.length; i++) {
      const dependency = node.imports[i];
      const isLast = i === node.imports.length - 1;
  
      console.log(
        `${prefix}${isLast ? "└──" : "├──"} ${dependency}`
      );
  
      if (!ancestors.has(dependency)) {
        printDependencyTree(
          dependency,
          dependencies,
          `${prefix}${isLast ? "    " : "│   "}`,
          ancestors,
        );
      }
    }
    ancestors.delete(file);
}

export function printReport(report: Report): void {
  console.log("");
  console.log(report.contextCompiler ? "AI Context Compiler (experimental)" : "AI Context Report");
  console.log("────────────────────────────────────");

  console.log(`Repository:      ${path.basename(report.root)}`);
  if (report.contextCompiler) {
    console.log(`Task:            ${report.contextCompiler.task}`);
    console.log("Candidate ranking");
    for (const candidate of report.contextCompiler.candidates) {
      console.log(`  ${candidate.score}  ${candidate.file} (${candidate.reasons.join(", ")})`);
    }
    console.log("Selection is heuristic; relevance is not guaranteed.");
    if (report.combinedContext) printCombinedContext(report.combinedContext, "Task-specific context", true);
    console.log("");
    console.log("Repository dependency diagnostics for task-selected files");
    console.log("Per-file totals and hotspots follow the full repository import graph.");
  }
  console.log(`${report.contextCompiler ? "Task-selected files:" : "Files analyzed: "} ${report.files.length}`);
  const isFocusedReport =
  report.contextAnalysis.length !== report.files.length;
  if (report.contextCompiler) {
    console.log(`Task-selected own tokens: ${report.totalEstimatedTokens.toLocaleString()}`);
  } else {
    const tokenLabel = isFocusedReport ? "Selected tokens:" : "Estimated tokens:";
    const tokens = report.combinedContext?.totalTokens ?? report.totalEstimatedTokens;
    console.log(`${tokenLabel} ${tokens.toLocaleString()}`);
  }

  console.log(
    `Source size:      ${(report.totalBytes / 1024).toFixed(1)} KB`
  );

  console.log("");

  if (report.issues.length === 0) {
    console.log("✓ No context issues found.");
  } else {
    console.log("Findings");
    console.log("────────────────────────────────────");

    for (const issue of report.issues) {
      const prefix =
        issue.severity === "error"
          ? "✗"
          : issue.severity === "warning"
          ? "⚠"
          : "ℹ";

      console.log(`${prefix} [${issue.code}]`);

      if (issue.file) {
        console.log(`  File: ${issue.file}`);
      }

      console.log(`  ${issue.message}`);

      if (issue.estimatedTokens) {
        console.log(
          `  Tokens: ${issue.estimatedTokens.toLocaleString()}`
        );
      }

      console.log("");
    }
  }

  console.log(
    report.contextCompiler || isFocusedReport
      ? "Selected files"
      : "Top files by estimated context"
  );
  console.log("────────────────────────────────────");

  for (const file of report.files.slice(0, 10)) {
    console.log(
      `${file.estimatedTokens.toLocaleString().padStart(8)}  ${file.path}`
    );
  }

  console.log("Context Analysis");
console.log("────────────────────────────────────");

for (const context of report.contextAnalysis) {
  console.log("");
  console.log(context.file);
  console.log(
    `  Own tokens:        ${context.ownTokens.toLocaleString()}`
  );
  console.log(
    `  Dependency tokens: ${context.dependencyTokens.toLocaleString()}`
  );
  console.log(
    `  Total context:     ${context.transitiveTokens.toLocaleString()}`
  );
  console.log(
    `  Amplification:     ${context.amplification.toFixed(2)}x`
  );

  if (context.transitiveFiles.length > 0) {
    console.log(
      `  Dependencies:      ${context.transitiveFiles.length}`
    );
  
    console.log("  Dependency tree:");
  
    printDependencyTree(
      context.file,
      report.dependencyGraph,
      "    "
    );
  }
}

  if (report.combinedContext && !report.contextCompiler) {
    printCombinedContext(report.combinedContext, "Selected Context");
  }

  console.log("");
}

function printCombinedContext(context: CombinedContextAnalysis, title: string, listFiles = false): void {
  console.log("");
  console.log(title);
  console.log("────────────────────────────────────");
  console.log(`Selected files:    ${context.selectedFiles.length}`);
  console.log(`Own tokens:        ${context.ownTokens.toLocaleString()}`);
  console.log(`Dependency tokens: ${context.dependencyTokens.toLocaleString()}`);
  console.log(`Unique context:    ${context.totalTokens.toLocaleString()}`);
  console.log(`Context files:     ${context.contextFiles.length}`);
  if (listFiles) {
    for (const file of context.contextFiles) console.log(`  ${file}`);
  }
}
