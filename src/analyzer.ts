import type { ContextAnalysis, FileStat, Issue } from "./types.js";

const LARGE_FILE_TOKENS = 10_000;
const GENERATED_FILE_TOKENS = 2_000;

export function analyzeFiles(files: FileStat[]): Issue[] {
  const issues: Issue[] = [];

  if (files.length === 0) {
    issues.push({
      severity: "warning",
      code: "NO_CODE",
      message: "No supported source files were found.",
    });

    return issues;
  }

  for (const file of files) {
    if (file.estimatedTokens >= LARGE_FILE_TOKENS) {
      issues.push({
        severity: "warning",
        code: "LARGE_FILE",
        file: file.path,
        estimatedTokens: file.estimatedTokens,
        message:
          "Large source file may consume significant AI context.",
      });
    }

    if (
      file.isGenerated &&
      file.estimatedTokens >= GENERATED_FILE_TOKENS
    ) {
      issues.push({
        severity: "info",
        code: "GENERATED_FILE",
        file: file.path,
        estimatedTokens: file.estimatedTokens,
        message:
          "Generated source contributes significant context but may provide low reasoning value.",
      });
    }
  }

  const totalTokens = files.reduce(
    (sum, file) => sum + file.estimatedTokens,
    0
  );

  const generatedTokens = files
    .filter((file) => file.isGenerated)
    .reduce((sum, file) => sum + file.estimatedTokens, 0);

  const generatedShare = totalTokens === 0
    ? 0
    : generatedTokens / totalTokens;

  if (generatedShare >= 0.1) {
    issues.push({
      severity: "warning",
      code: "GENERATED_CONTEXT",
      estimatedTokens: generatedTokens,
      message:
        `Generated files account for ${(generatedShare * 100).toFixed(1)}% of estimated repository tokens.`,
    });
  }

  return issues;
}

export function analyzeContextHotspots(
  contextAnalysis: ContextAnalysis[]
): Issue[] {
  const issues: Issue[] = [];

  const HOTSPOT_AMPLIFICATION = 3;

  for (const context of contextAnalysis) {
    if (context.amplification >= HOTSPOT_AMPLIFICATION) {
      issues.push({
        severity: "warning",
        code: "CONTEXT_HOTSPOT",
        file: context.file,
        estimatedTokens: context.transitiveTokens,
        message:
          `Context amplification is ${context.amplification.toFixed(
            2
          )}x. This file may require significantly more context than its own size.`,
      });
    }
  }

  return issues;
}