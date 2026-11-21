# ai-context-lint

[![npm version](https://img.shields.io/npm/v/ai-context-lint.svg)](https://www.npmjs.com/package/ai-context-lint)
[![CI](https://github.com/iamYashSinha/ai-context-lint/actions/workflows/ci.yml/badge.svg)](https://github.com/iamYashSinha/ai-context-lint/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

Analyze codebase context, token usage, and dependency overhead for AI coding agents.

AI coding agents do not only consume the file you are editing. They often also need related files through imports and dependencies.

`ai-context-lint` analyzes repository dependencies, measures transitive context, and uses real tokenization to estimate how much source an AI coding agent may need to understand before working on a file.

Think of it as ESLint for AI context.

## Installation

Run once with `npx`:

```bash
npx ai-context-lint .
```

Or install globally:

```bash
npm install -g ai-context-lint
ai-context-lint .
```

Requires **Node.js 22+**.

## Usage

Scan a repository:

```bash
ai-context-lint .
ai-context-lint ./path/to/repo
```

Analyze selected files, including shared transitive dependencies counted only once:

```bash
ai-context-lint . --files src/payment/PaymentService.ts src/payment/PaymentClient.ts
```

JSON output:

```bash
ai-context-lint . --json
```

### CI mode

Use CI mode to enforce a maximum context budget:

```bash
ai-context-lint . --ci --max-tokens 50000
```

The command exits with code `1` when the configured token threshold is exceeded, making it suitable for CI pipelines.

For example:

```text
CI check failed: 62431 tokens exceeds the maximum of 50000 tokens.
```

This allows repositories to prevent context cost from silently growing as the codebase evolves.

### GitHub Actions

You can run `ai-context-lint` directly in GitHub Actions:

```yaml
- name: Check AI context cost
  run: npx ai-context-lint . --ci --max-tokens 50000
```

### Experimental Context Compiler

Select likely task-relevant files using deterministic filename and source keyword signals:

```bash
ai-context-lint . --task "Add retry support to the payment client"
ai-context-lint . --task "Add retry support to the payment client" --json
```

The compiler ranks candidate files, selects strong matches, and includes their transitive imports.
It reports selected files, relevance reasons, and unique context tokens. Unrelated upstream
callers are not automatically included. `--task` cannot be combined with `--files`.

The **Task-specific context** section reports the unique files and tokens selected for the task.
In JSON, these totals are in `combinedContext` (also available as `contextCompiler.context`).
`files`, `totalBytes`, and `totalEstimatedTokens` describe the task-selected files themselves.
The separate repository dependency diagnostics show findings and per-file import costs for
those files using the full repository graph. These costs can include files outside the task
context. JSON exposes them as `issues`, `contextAnalysis`, and `dependencyGraph`, with
`scopes` describing each section.

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

## Example

```text
AI Context Report
────────────────────────────────────
Repository:      test-repo
Files analyzed:  4
Estimated tokens: 349
Source size:      1.4 KB

Findings
────────────────────────────────────
⚠ [CONTEXT_HOTSPOT]
  File: src/payment/PaymentService.ts
  Context amplification is 4.20x. This file may require significantly more context than its own size.
  Tokens: 349

Context Analysis
────────────────────────────────────
src/payment/PaymentService.ts
  Own tokens:        83
  Dependency tokens: 266
  Total context:     349
  Amplification:     4.20x
  Dependencies:      3
  Dependency tree:
    ├── src/payment/PaymentClient.ts
    │   └── src/http/HttpClient.ts
    └── src/payment/RetryPolicy.ts
```

`PaymentService.ts` is small on its own, but importing the HTTP client and retry policy multiplies the context an agent may need.

## What it detects

| Code                | Meaning                                                      |
| ------------------- | ------------------------------------------------------------ |
| `CONTEXT_HOTSPOT`   | Transitive context is at least 3× the file's own token count |
| `LARGE_FILE`        | A source file is at least ~10,000 tokens                     |
| `GENERATED_FILE`    | A generated file contributes significant context             |
| `GENERATED_CONTEXT` | Generated files are a large share of repository tokens       |
| `NO_CODE`           | No supported source files were found                         |

### Token counting

Token counts are calculated using the `o200k_base` tokenizer rather than a character-based approximation.

This provides a more meaningful estimate of LLM context usage than `characters / 4`, while still being an approximation of the tokens an individual model may ultimately consume.

## Context amplification

One of the core metrics is context amplification.

For a file:

```text
context amplification =
  total transitive context tokens / file's own tokens
```

For example:

```text
PaymentService.ts
Own tokens:        83
Dependency tokens: 266
Total context:     349
Amplification:     4.20x
```

This means an agent potentially needs to reason about more than four times the file's own token count when following its dependency chain.

When multiple selected files share dependencies, `ai-context-lint` deduplicates those dependencies so shared files are counted only once.

## Architecture

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
| `analyzer.ts`     | Emits issues for file size, generated noise, and context amplification  |
| `reporter.ts`     | Produces the human-readable report                                      |
| `cli.ts`          | Handles command-line options, JSON output, and CI checks                |

Supported extensions include JavaScript/TypeScript, Python, Go, Rust, Java, C/C++, and several other common source types.

Common generated and dependency directories such as `node_modules`, `dist`, `build`, `coverage`, and `vendor` are ignored.

## Development

Clone the repository and install dependencies:

```bash
npm install
```

Build:

```bash
npm run build
```

Run tests:

```bash
npm test
```

Run locally against the test repository:

```bash
npm run dev -- ./test-repo
```

## Roadmap

### Done

* Repository scanning
* Dependency graph analysis
* Transitive context analysis
* Context amplification
* Shared dependency deduplication
* Real `o200k_base` tokenization
* JSON output
* CI mode with configurable token thresholds
* GitHub Actions CI

### Next

* Configurable context hotspot thresholds
* Configurable ignore rules
* Improved TypeScript path alias and module resolution
* Richer guidance for reducing context amplification
* Context Profiler
* Context Compiler prototype

## The bigger idea

`ai-context-lint` is the first step toward a larger workflow for AI-assisted software development.

Today:

```text
AI Context Lint
Understand the context cost.
```

Next:

```text
Context Profiler
Understand what AI coding agents actually consume.
```

Eventually:

```text
Context Compiler
Construct the minimum useful context for a specific coding task.
```

The goal is to move from:

```text
"Here's the entire repository. Figure it out."
```

to:

```text
"Here's the context that's actually relevant to this task."
```

## Contributing

Bug reports, feature requests, and pull requests are welcome.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup and review expectations.

## License

[MIT](./LICENSE) © 2026 Yash Sinha
