# ai-context-lint

[![npm version](https://img.shields.io/npm/v/ai-context-lint.svg)](https://www.npmjs.com/package/ai-context-lint)
[![CI](https://github.com/iamYashSinha/ai-context-lint/actions/workflows/ci.yml/badge.svg)](https://github.com/iamYashSinha/ai-context-lint/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

Analyze repository context cost and noise for AI coding agents.

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
