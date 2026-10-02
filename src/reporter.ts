import path from "node:path";

import type { Report, DependencyInfo } from "./types.js";


function printDependencyTree(
    file: string,
    dependencies: DependencyInfo[],
    prefix = ""
  ): void {
    const node = dependencies.find(
      (dependency) => dependency.file === file
    );
  
    if (!node) {
      return;
    }
  
    for (let i = 0; i < node.imports.length; i++) {
      const dependency = node.imports[i];
      const isLast = i === node.imports.length - 1;
  
      console.log(
        `${prefix}${isLast ? "└──" : "├──"} ${dependency}`
      );
  
      printDependencyTree(
        dependency,
        dependencies,
        `${prefix}${isLast ? "    " : "│   "}`
      );
    }
}

export function printReport(report: Report): void {
  console.log("");
  console.log("AI Context Report");
  console.log("────────────────────────────────────");

  console.log(`Repository:      ${path.basename(report.root)}`);
  console.log(`Files analyzed:  ${report.files.length}`);
  const isFocusedReport =
  report.contextAnalysis.length !== report.files.length;
  console.log(
    `${isFocusedReport ? "Selected tokens:" : "Estimated tokens:"} ${report.totalEstimatedTokens.toLocaleString()}`
  );
  
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
    isFocusedReport
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

if (report.combinedContext) {
    console.log("");
  
    console.log("Selected Context");
  
    console.log("────────────────────────────────────");
  
    console.log(
      `Selected files:    ${report.combinedContext.selectedFiles.length}`
    );
  
    console.log(
      `Own tokens:        ${report.combinedContext.ownTokens.toLocaleString()}`
    );
  
    console.log(
      `Dependency tokens: ${report.combinedContext.dependencyTokens.toLocaleString()}`
    );
  
    console.log(
      `Unique context:    ${report.combinedContext.totalTokens.toLocaleString()}`
    );
  
    console.log(
      `Context files:     ${report.combinedContext.contextFiles.length}`
    );
  }

  console.log("");
}