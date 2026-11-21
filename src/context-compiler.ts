import fs from "node:fs/promises";
import path from "node:path";
import { analyzeCombinedContext } from "./context.js";
import type { DependencyInfo, FileStat, ContextCompilerResult, ContextCandidate } from "./types.js";

const STOP = new Set(["the","and","for","with","from","into","this","that","add","fix","update","implement","support","using","make","code","file","files","our","your","new"]);
function words(value: string): string[] {
  return [...new Set((value.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(word => word.length >= 3 && !STOP.has(word)))];
}
function matches(value: string, term: string): boolean {
  return words(value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_./-]/g, " ")).includes(term);
}
export async function compileContext(task: string, root: string, files: FileStat[], graph: DependencyInfo[]): Promise<ContextCompilerResult> {
  const terms = words(task.replace(/([a-z])([A-Z])/g, "$1 $2"));
  if (!terms.length) throw new Error("--task requires meaningful keywords");
  const candidates: ContextCandidate[] = [];
  for (const file of files) {
    const source = await fs.readFile(path.resolve(root, file.path), "utf8");
    const reasons: string[] = [];
    let score = 0;
    for (const term of terms) {
      if (matches(file.path, term)) { score += 5; reasons.push(`path: ${term}`); }
      if (matches(source, term)) { score += 1; reasons.push(`source: ${term}`); }
    }
    if (file.isGenerated) { score = Math.max(0, score - 5); reasons.push("generated-file penalty"); }
    if (score > 0) candidates.push({file: file.path, score, reasons});
  }
  candidates.sort((a,b) => b.score - a.score || a.file.localeCompare(b.file));
  // Strong task matches become roots; weak source-only matches do not pull in arbitrary callers.
  const roots = candidates.filter(candidate => candidate.score >= 5).map(candidate => candidate.file);
  const selected = new Set<string>(roots);
  const imports = new Map(graph.map(node => [node.file, node.imports]));
  const stack = [...roots];
  while (stack.length) {
    const current = stack.pop()!;
    for (const dependency of imports.get(current) ?? []) {
      if (!selected.has(dependency)) { selected.add(dependency); stack.push(dependency); }
    }
  }
  const selectedFiles = files.map(file => file.path).filter(file => selected.has(file));
  return {
    task, candidates, selectedFiles,
    context: analyzeCombinedContext(selectedFiles, files, graph),
  };
}
