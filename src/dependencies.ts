import fs from "node:fs/promises";
import path from "node:path";

import type { DependencyInfo, FileStat } from "./types.js";

const IMPORT_REGEX =
  /(?:import\s+(?:.*?\s+from\s+)?|export\s+.*?\s+from\s+|require\s*\()\s*["']([^"']+)["']/g;

function isRelativeImport(importPath: string): boolean {
  return importPath.startsWith(".");
}

async function resolveImport(
  currentFile: string,
  importPath: string,
  root: string
): Promise<string | null> {
  if (!isRelativeImport(importPath)) {
    return null;
  }

  const currentDir = path.dirname(currentFile);

  const importWithoutExtension = importPath.replace(
    /\.(js|jsx|ts|tsx)$/,
    ""
  );
  
  const possiblePaths = [
    path.resolve(currentDir, importPath),
    path.resolve(currentDir, `${importWithoutExtension}.ts`),
    path.resolve(currentDir, `${importWithoutExtension}.tsx`),
    path.resolve(currentDir, `${importWithoutExtension}.js`),
    path.resolve(currentDir, `${importWithoutExtension}.jsx`),
  ];

  for (const candidate of possiblePaths) {
    try {
      const stat = await fs.stat(candidate);

      if (stat.isFile()) {
        return path.relative(root, candidate);
      }
    } catch {
      // File doesn't exist. Try next candidate.
    }
  }

  return null;
}

export async function buildDependencyGraph(
  root: string,
  files: FileStat[]
): Promise<DependencyInfo[]> {
  const graph = new Map<string, DependencyInfo>();

  for (const file of files) {
    graph.set(file.path, {
      file: file.path,
      imports: [],
      importedBy: [],
    });
  }

  for (const file of files) {
    const absolutePath = path.resolve(root, file.path);
    const content = await fs.readFile(absolutePath, "utf8");

    const imports: string[] = [];

    for (const match of content.matchAll(IMPORT_REGEX)) {
      const importPath = match[1];

      const resolved = await resolveImport(
        absolutePath,
        importPath,
        root
      );

      if (resolved && graph.has(resolved)) {
        imports.push(resolved);
      }
    }

    const node = graph.get(file.path);

    if (node) {
      node.imports = [...new Set(imports)];
    }
  }

  for (const node of graph.values()) {
    for (const dependency of node.imports) {
      const dependencyNode = graph.get(dependency);

      if (dependencyNode) {
        dependencyNode.importedBy.push(node.file);
      }
    }
  }

  return [...graph.values()];
}