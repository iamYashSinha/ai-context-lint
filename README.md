# ai-context-lint

[![npm version](https://img.shields.io/npm/v/ai-context-lint.svg)](https://www.npmjs.com/package/ai-context-lint)
[![CI](https://github.com/iamYashSinha/ai-context-lint/actions/workflows/ci.yml/badge.svg)](https://github.com/iamYashSinha/ai-context-lint/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

Analyze repository context cost and noise for AI coding agents.

AI coding agents do not only consume the file you are editing. They often also need related files through imports and dependencies. `ai-context-lint` estimates how much source a file can pull into context, and flags files that amplify far beyond their own size.

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

Analyze selected files (including shared transitive dependencies, counted once):

```bash
ai-context-lint . --files src/payment/PaymentService.ts src/payment/PaymentClient.ts
```

JSON output:

```bash
ai-context-lint . --json
```

### Example

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

| Code | Meaning |
| --- | --- |
| `CONTEXT_HOTSPOT` | Transitive context is at least 3× the file's own estimated tokens |
| `LARGE_FILE` | A source file is at least ~10,000 estimated tokens |
| `GENERATED_FILE` | A generated file contributes significant context |
| `GENERATED_CONTEXT` | Generated files are a large share of repository tokens |
| `NO_CODE` | No supported source files were found |

Token counts are a v0.1 approximation (`ceil(characters / 4)`), not a model-specific tokenizer.

## Architecture

```text
scan → dependency graph → transitive context → findings → report
```

| Module | Role |
| --- | --- |
| `scanner.ts` | Finds supported source files, estimates tokens, marks generated files |
| `dependencies.ts` | Parses local imports into a directed graph (including cycles) |
| `context.ts` | Walks transitive dependencies; optional combined context for selected files |
| `analyzer.ts` | Emits issues for size, generated noise, and amplification hotspots |
| `reporter.ts` / `cli.ts` | Human-readable report or JSON |

Supported extensions include JavaScript/TypeScript, Python, Go, Rust, Java, C/C++, and several other common source types. `node_modules`, `dist`, and similar build directories are ignored.

## Development

```bash
npm install
npm run build
npm test
npm run dev -- ./test-repo
```

## Roadmap

- Replace character-based token estimates with a real tokenizer
- Broader import and module-resolution support
- Configurable thresholds and ignore rules
- CI-friendly checks against a context budget
- Richer guidance for reducing hotspot amplification

## Contributing

Bug reports and pull requests are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup and review expectations.

## License

[MIT](./LICENSE) © 2026 Yash Sinha

