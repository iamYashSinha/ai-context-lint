# ai-context-lint

[![npm version](https://img.shields.io/npm/v/ai-context-lint.svg)](https://www.npmjs.com/package/ai-context-lint)
[![CI](https://github.com/iamYashSinha/ai-context-lint/actions/workflows/ci.yml/badge.svg)](https://github.com/iamYashSinha/ai-context-lint/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

See which source files an AI coding agent may need, estimate their token cost, and
export the context for a specific task.

## Quick start

Requires **Node.js 22.12 or later**. Scan a repository with:

```bash
npx ai-context-lint .
```

For regular use, run `npm install -g ai-context-lint`, then use `ai-context-lint` directly.
Pass a directory path in place of `.` to scan another repository.

## Build context for a task

```bash
ai-context-lint . --task "Add retry support to the payment client"
```

The experimental Context Compiler scores files using task intent and matches in paths
and source code. It starts from strong matches, follows their imports, and counts each
file once. Interface-change tasks can also include relevant direct callers.

Try the payment retry example from a checkout after `npm ci` and `npm run build`:

```bash
node dist/cli.js test-repo --task "Add retry support to the payment client"
```

| File | Score | Why it enters the context |
| --- | ---: | --- |
| `PaymentClient.ts` | 12 | Its filename and source match `payment` and `client`. |
| `RetryPolicy.ts` | 11 | Its filename and source match `retry`, and its directory matches `payment`. |
| `HttpClient.ts` | 6 | `PaymentClient.ts` imports it, so it enters even below the starting-file cutoff of 10. |

Look for **Task-specific context** in the report. This example includes **3 files and
267 estimated source tokens**, including the HTTP client's 191 tokens. The separate
repository diagnostics show what individual files can pull in through the full import graph.

### Export to Markdown

```bash
ai-context-lint . --task "Add retry support to the payment client" --output context.md
```

The bundle contains the task, repository-relative paths, selection reasons, and full source.
Choose a new file in an existing directory. Add `--json` to keep JSON on stdout while
writing the bundle. `--task` and `--files` are mutually exclusive.

From a development checkout, the shortcut below writes to `context.md` by default.
Append `--output demo-context.md` to choose another file.

```bash
npm run context:bundle -- test-repo --task "Add retry support to the payment client"
```

## Inspect repository context

| To… | Run |
| --- | --- |
| Scan the repository | `ai-context-lint .` |
| Check one file and its imports | `ai-context-lint . --files src/payment/PaymentService.ts` |
| Get a machine-readable report | `ai-context-lint . --json` |
| Enforce a token budget | `ai-context-lint . --ci --max-tokens 50000` |

**Context amplification** is the total estimated context tokens divided by the file's
own tokens. In the sample repository, `PaymentService.ts` starts at 71 tokens and
reaches 338 with its imports, or **4.76×** its own size. Shared dependencies count once
when analyzing multiple files.

CI exits with status 1 if the budget is exceeded. Add this step to a GitHub Actions job
after checkout and Node.js setup:

```yaml
- name: Check AI context cost
  run: npx ai-context-lint . --ci --max-tokens 50000
```

<details>
<summary>Report fields, findings, and export behavior</summary>

### Reports

In JSON, these totals are in `combinedContext` (also available as `contextCompiler.context`).
`files`, `totalBytes`, and `totalEstimatedTokens` describe the task-selected files themselves.
The separate repository dependency diagnostics show findings and per-file import costs for
those files using the full repository graph. These costs can include files outside the task
context. JSON exposes them as `issues`, `contextAnalysis`, and `dependencyGraph`, with
`scopes` describing each section.

Token estimates use the `o200k_base` tokenizer. Actual usage depends on the model.

| Code                | Meaning                                                      |
| ------------------- | ------------------------------------------------------------ |
| `CONTEXT_HOTSPOT`   | Transitive context is at least 3× the file's own token count |
| `LARGE_FILE`        | A source file is at least ~10,000 tokens                     |
| `GENERATED_FILE`    | A generated file contributes significant context             |
| `GENERATED_CONTEXT` | Generated files are a large share of repository tokens       |
| `NO_CODE`           | No supported source files were found                         |

### Export behavior

Markdown files use the same paths as `combinedContext.contextFiles`, sorted and deduplicated.
If the task has no matches, the bundle includes the task and an empty-selection message.
Output paths are relative to the current working directory. File errors go to stderr and
return a nonzero status. When a CI budget is set, the CLI checks it before writing the bundle.

</details>

<details>
<summary>Compiler scoring, limitations, and benchmarks</summary>

#### Task intent and scoring

The compiler recognizes interface changes first, then testing, bug-fix, refactor, and explanation
keywords in that order. Other descriptions use keyword scoring alone. For the four non-interface
intents, recognized intent words are dropped from the topic. Testing also drops common request
words such as `write`, `related`, and `unit`.

- Each topic term adds **5** for a filename-stem match or a meaningful directory match, with the
  filename taking precedence. A source match adds **1** independently. Common structural and
  fixture directories such as `src`, `fixtures`, and `test-repo` provide no directory points.
  Test directories identify test files and provide no directory points.
- Testing, bug-fix, refactor, and explanation add **5** to implementation files whose paths
  match every topic term. Testing adds **10** to a conventional test file whose path matches
  every topic term or which directly imports a qualifying implementation file. Conventional
  tests include `*.test.*`, `*.spec.*`, `test_*`, `spec_*`, and files under `tests` or `__tests__`.
- Generated files lose **5**, floored at zero. A score of **10** qualifies a file as a starting
  point for dependency expansion. Testing starts from implementation and related tests.
  Bug-fix, refactor, and explanation start from implementation. Import traversal from a
  starting file follows the dependency graph as usual.
- Candidates sort by descending score, then by path. Each score contribution has a reason.

**Experimental limitations:** Keyword matching cannot determine actual business impact,
and including the complete transitive import closure can over-select dependencies.
Classification uses fixed keywords with fixed precedence, so mixed requests or keywords inside
symbol names can be misclassified. Test discovery depends on naming conventions and recognized
direct imports. A test related only through an indirect import or a source mention can be missed.

For interface-change tasks, task-matching direct callers can contribute one additional import hop.
The compiler checks referenced named bindings from local imports already present in the dependency
graph. It matches imported symbol names against task keywords, preferring keywords outside the
strongly matched file paths when available. Additional modules are counted once across callers.
Dependencies already reachable from strong matches retain their full transitive context.

This is lexical evidence and cannot establish which symbols affect the changed contract.
Comments, strings, and shadowing can produce false positives. Default and namespace bindings,
dynamic imports, path aliases, and dependencies beyond that extra hop can be missed.

To benchmark, run the built CLI against an unchanged checkout of `fca41e4` using
`--task "Change the context compiler result interface" --json`. Both the baseline and the
updated compiler returned the same five files and 3,839 unique estimated tokens on that snapshot.
The regression fixture separately verifies that relevant imports can enter the context and
that a shared import counts only once.

#### Phase 6 CLI comparison

Run each CLI against the same checkout of `6de0e71` with
`node <build>/cli.js <checkout> --task "<prompt>" --json`. Compare
`contextCompiler.candidates` and `contextCompiler.context`.

| Prompt | Before | Phase 6 |
| --- | --- | --- |
| `write a payment related test` | 4 files, 338 unique tokens. `PaymentClient.ts` got 5 points from `path: test`. | The same 4 files and 338 tokens. `PaymentClient.ts` gets 5 intent points for matching the payment topic. `tests/cli.test.ts` falls from 7 to 1 and stays outside the context. |
| `Change the context compiler result interface` | 7 files, 5,809 unique tokens. | The same files and token count, including the direct callers. Path reasons identify the filename. |
| `Explain the payment service` | 4 files, 338 unique tokens. `PaymentService.ts` scores 12. | The same 4 files and 338 tokens. `PaymentService.ts` scores 17 and its imports still supply the supporting files. |

The benchmark checkout has no payment-specific test file. The regression fixture adds a named
payment spec, a smoke test that directly imports the payment implementation, and an unrelated CLI
test with a payment mention. The compiler includes both related tests and excludes the CLI test.

</details>

<details>
<summary>Architecture and supported source files</summary>

### Architecture

```text
scan
  ↓
dependency graph
  ↓
transitive context
  ↓
token analysis
  ↓
findings
  ↓
report / CI
```

| Module            | Role                                                                    |
| ----------------- | ----------------------------------------------------------------------- |
| `scanner.ts`      | Finds supported source files and collects file statistics               |
| `tokenizer.ts`    | Calculates token counts using `o200k_base`                              |
| `dependencies.ts` | Parses local imports into a directed dependency graph, including cycles |
| `context.ts`      | Walks transitive dependencies and calculates combined context           |
| `context-compiler.ts` | Scores task candidates and expands the selected context |
| `context-bundle.ts` | Writes the selected context as Markdown |
| `analyzer.ts`     | Emits issues for file size, generated noise, and context amplification  |
| `reporter.ts`     | Produces the human-readable report                                      |
| `cli.ts`          | Handles command-line options, JSON output, and CI checks                |

Supported extensions include JavaScript/TypeScript, Python, Go, Rust, Java, C/C++, and several other common source types.

Common generated and dependency directories such as `node_modules`, `dist`, `build`, `coverage`, and `vendor` are ignored.

</details>

## Development

```bash
npm ci
npm run build
npm test
npm run dev -- ./test-repo
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup and review expectations.

## Roadmap

Planned work includes configurable ignore rules and hotspot thresholds, better TypeScript
module resolution, and more guidance for reducing context amplification. A future
Context Profiler could show which files coding agents use on real tasks.

## License

[MIT](./LICENSE) © 2026 Yash Sinha
