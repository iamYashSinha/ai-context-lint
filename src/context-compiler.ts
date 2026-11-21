import fs from "node:fs/promises";
import path from "node:path";
import { analyzeCombinedContext } from "./context.js";
import { resolveImport } from "./dependencies.js";
import type { DependencyInfo, FileStat, ContextCompilerResult, ContextCandidate } from "./types.js";

const STOP = new Set(["the","and","for","with","from","into","this","that","add","fix","update","implement","support","using","make","code","file","files","our","your","new"]);
function words(value: string): string[] {
  return [...new Set((value.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(word => word.length >= 3 && !STOP.has(word)))];
}
function matches(value: string, term: string): boolean {
  return words(value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_./-]/g, " ")).includes(term);
}
const INTERFACE_TERMS = ["interface", "api", "contract", "type"];
const CHANGE_ACTION = /\b(change|modify|rename|update|refactor|alter|extend|remove)\b/i;
const NAMED_IMPORT = /(?:^|[;\n])\s*import\s+(?:type\s+)?(?:[$\w]+\s*,\s*)?\{([^{}]*)\}\s*from\s*["']([^"'\n]+)["']/g;

async function relevantCallerImports(
  caller: string,
  root: string,
  dependencies: string[],
  selected: Set<string>,
  topic: string[],
): Promise<string[]> {
  const kept = new Set(dependencies.filter(dependency => selected.has(dependency)));
  if (!topic.length || kept.size === dependencies.length) return [...kept];

  const absolutePath = path.resolve(root, caller);
  const source = await fs.readFile(absolutePath, "utf8");
  const body = source.replace(NAMED_IMPORT, "");
  const identifiers = new Set(body.match(/[$A-Z_a-z][$\w]*/g));
  for (const [, bindings, specifier] of source.matchAll(NAMED_IMPORT)) {
    const relevant = bindings.split(",").some(binding => {
      const match = binding.trim().match(/^(?:type\s+)?([$\w]+)(?:\s+as\s+([$\w]+))?$/);
      if (!match) return false;
      const [, imported, alias] = match;
      return identifiers.has(alias ?? imported) && topic.some(term => matches(imported, term));
    });
    if (!relevant) continue;
    const resolved = await resolveImport(absolutePath, specifier, root);
    if (resolved && dependencies.includes(resolved)) kept.add(resolved);
  }
  return [...kept];
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
  const roots = candidates.filter(candidate => candidate.score >= 10).map(candidate => candidate.file);
  const selected = new Set<string>(roots);
  const imports = new Map(graph.map(node => [node.file, node.imports]));
  const stack = [...roots];
  while (stack.length) {
    const current = stack.pop()!;
    for (const dependency of imports.get(current) ?? []) {
      if (!selected.has(dependency)) { selected.add(dependency); stack.push(dependency); }
    }
  }
  // A caller already reached from a root keeps its full import closure.
  const callerOnly = new Set<string>();
  const isInterfaceChange = terms.some(term => INTERFACE_TERMS.includes(term)) && CHANGE_ACTION.test(task);
  const candidateByFile = new Map(candidates.map(candidate => [candidate.file, candidate]));
  if (isInterfaceChange) {
    const importedBy = new Map(graph.map(node => [node.file, node.importedBy]));
    for (const rootFile of roots) {
      for (const caller of importedBy.get(rootFile) ?? []) {
        const candidate = candidateByFile.get(caller);
        if (!candidate || selected.has(caller)) continue;
        selected.add(caller);
        callerOnly.add(caller);
        candidate.reasons.push(`direct caller of: ${rootFile} (interface change)`);
      }
    }
  }
  const selectedFiles = files.map(file => file.path).filter(file => selected.has(file));
  let contextGraph = graph;
  if (callerOnly.size) {
    const topic = terms.filter(term => !INTERFACE_TERMS.includes(term) && !CHANGE_ACTION.test(term));
    // Prefer qualifiers that identify the change within the matched modules.
    const qualifiers = topic.filter(term => !roots.some(file => matches(file, term)));
    const callerImports = new Map<string, string[]>();
    for (const caller of callerOnly) {
      const dependencies = imports.get(caller) ?? [];
      const kept = await relevantCallerImports(caller, root, dependencies, selected, qualifiers.length ? qualifiers : topic);
      const included = kept.filter(file => !selected.has(file));
      const reasons = candidateByFile.get(caller)!.reasons;
      for (const file of included) reasons.push(`task-relevant import: ${file}`);
      if (kept.length < dependencies.length) reasons.push("other caller-only imports omitted");
      callerImports.set(caller, kept);
    }
    // Keep evidence-backed additions as leaves. Root paths retain their original closure.
    contextGraph = graph.map(node => selected.has(node.file)
      ? { ...node, imports: callerImports.get(node.file) ?? node.imports }
      : { ...node, imports: [] });
  }
  return {
    task, candidates, selectedFiles,
    context: analyzeCombinedContext(selectedFiles, files, contextGraph),
  };
}
