import fs from "node:fs/promises";
import path from "node:path";
import type { ContextCompilerResult } from "./types.js";

const languageAliases: Readonly<Record<string, string>> = {
  cjs: "javascript",
  mjs: "javascript",
  cc: "cpp",
  h: "c",
  hpp: "cpp",
  kts: "kotlin",
  sh: "bash",
};

function backtickFence(content: string, length: number): string {
  for (const match of content.matchAll(/`+/g)) {
    length = Math.max(length, match[0].length + 1);
  }
  return "`".repeat(length);
}

function fencedBlock(content: string, language = ""): string {
  const fence = backtickFence(content, 3);
  const newline = content.endsWith("\n") ? "" : "\n";
  return `${fence}${language}\n${content}${newline}${fence}`;
}

function inlineCode(value: string): string {
  // Quoting preserves control characters in filenames and rationale on one line.
  const quoted = JSON.stringify(value);
  const fence = backtickFence(quoted, 1);
  return `${fence} ${quoted} ${fence}`;
}

function isWithin(root: string, file: string): boolean {
  const relative = path.relative(root, file);
  return relative !== "" && relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

export async function renderContextBundle(root: string, result: ContextCompilerResult): Promise<string> {
  const files = [...new Set(result.context.contextFiles)].sort();
  const selected = new Set(result.selectedFiles);
  const candidates = new Map(result.candidates.map(candidate => [candidate.file, candidate]));
  const sections = ["# Task context bundle", "## Task", fencedBlock(result.task, "text"), "## Source files"];
  if (!files.length) sections.push("No source files matched this task.");

  const realRoot = await fs.realpath(root);
  for (const file of files) {
    const absolute = path.resolve(root, file);
    if (path.isAbsolute(file) || !isWithin(root, absolute)) {
      throw new Error(`Source path is outside the repository: ${JSON.stringify(file)}`);
    }
    const sourcePath = await fs.realpath(absolute);
    if (!isWithin(realRoot, sourcePath)) {
      throw new Error(`Source path is outside the repository: ${JSON.stringify(file)}`);
    }

    const source = await fs.readFile(sourcePath, "utf8");
    const extension = path.extname(file).slice(1).toLowerCase();
    const language = /^[a-z0-9]+$/.test(extension)
      ? (Object.hasOwn(languageAliases, extension) ? languageAliases[extension] : extension)
      : "";
    const candidate = candidates.get(file);
    const selection = selected.has(file)
      ? "Included in the compiler's selected files."
      : "Additional dependency included by the task compiler.";
    const rationale = candidate?.reasons.length
      ? `\n- Compiler signals (score ${candidate.score}): ${candidate.reasons.map(inlineCode).join(", ")}`
      : "";
    sections.push(`### ${inlineCode(file)}`, `- ${selection}${rationale}`, fencedBlock(source, language));
  }
  return sections.join("\n\n") + "\n";
}

export async function writeContextBundle(destination: string, root: string, result: ContextCompilerResult): Promise<void> {
  const markdown = await renderContextBundle(root, result);
  await fs.writeFile(destination, markdown, { encoding: "utf8", flag: "wx" });
}
