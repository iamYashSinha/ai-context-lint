export type IssueSeverity = "info" | "warning" | "error";

export interface FileStat {
  path: string;
  extension: string;
  bytes: number;
  estimatedTokens: number;
  isGenerated: boolean;
}
export interface Issue {
  severity: IssueSeverity;
  code: string;
  message: string;
  file?: string;
  estimatedTokens?: number;
}
export interface DependencyInfo {
  file: string;
  imports: string[];
  importedBy: string[];
}
export interface ContextAnalysis {
  file: string;
  ownTokens: number;
  dependencyTokens: number;
  transitiveFiles: string[];
  transitiveTokens: number;
  amplification: number;
}
export interface CombinedContextAnalysis {
  selectedFiles: string[];
  contextFiles: string[];
  ownTokens: number;
  dependencyTokens: number;
  totalTokens: number;
}
export interface ContextCandidate {
  file: string;
  score: number;
  reasons: string[];
}
export interface ContextCompilerResult {
  task: string;
  candidates: ContextCandidate[];
  selectedFiles: string[];
  context: CombinedContextAnalysis;
}
export interface Report {
  root: string;
  files: FileStat[];
  totalBytes: number;
  totalEstimatedTokens: number;
  issues: Issue[];
  contextAnalysis: ContextAnalysis[];
  dependencyGraph: DependencyInfo[];
  combinedContext?: CombinedContextAnalysis;
  contextCompiler?: ContextCompilerResult;
}
