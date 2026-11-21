# Context compiler engineering journal

The context compiler builds a task-specific set of source files from a task description and
the repository's import graph. This journal records how that behavior evolved and what the
fixtures and benchmarks verified. See the [README walkthrough](../README.md#how-task-context-is-built)
to reproduce the payment example.

## From repository analysis to task selection

The original CLI measured how much context a file brings in through its imports. The
[task compiler MVP](https://github.com/iamYashSinha/ai-context-lint/pull/28) added a way to
choose starting files from a task description. Scanning supplies paths and estimated
token counts. A graph of recognized local imports supplies the edges for expansion.
Keeping candidate reasons alongside scores lets users inspect why a file matched.

## Caller imports and reporting scope

For a change to an interface, a direct caller can show how the contract is used.
[Direct caller selection](https://github.com/iamYashSinha/ai-context-lint/pull/30) added
that evidence. Expanding every caller import also brought in unrelated modules, so
[caller expansion was limited](https://github.com/iamYashSinha/ai-context-lint/pull/31).
The compiler now retains an additional import when a caller uses a named binding whose
name matches the task, as covered by the
[shared caller dependency fixture](../tests/caller-dependencies.test.ts).

The [reporting change](https://github.com/iamYashSinha/ai-context-lint/pull/32) gave the
compiled task context and full repository diagnostics their own sections. The task report
answers which files enter the bundle. Per-file diagnostics show what the same file could
pull in through the full graph.

### Caller-import benchmark

To benchmark, run the built CLI against an unchanged checkout of `fca41e4` using
`--task "Change the context compiler result interface" --json`. Both the baseline and the
updated compiler returned the same five files and 3,839 unique estimated tokens on that snapshot.
The regression fixture separately verifies that relevant imports can enter the context and
that a shared import counts only once.

## Phase 6 · Task intent and meaningful paths

[Phase 6](https://github.com/iamYashSinha/ai-context-lint/pull/34) made scores more
informative for tasks such as testing and explanation. Generic paths such as `src` and
`test-repo` stopped contributing points. Testing intent added a way to find test files
through a matching test path or a direct import of qualifying implementation.

### Task intent and scoring

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
- Candidates sort by descending score, then by path. Reasons describe the scoring and selection signals.

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

### Phase 6 CLI comparison

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

## Phase 7 · Export the context

[Phase 7](https://github.com/iamYashSinha/ai-context-lint/pull/35) made the selected context
portable. The Markdown exporter uses the same `combinedContext.contextFiles` set that the
task report counts. It sorts paths, writes each source file once, and includes the task and
available reasons. Tests compare the exported file list against JSON, exercise a dependency
shared by multiple callers, and cover embedded Markdown fences and output errors.
See the [bundle tests](../tests/context-bundle.test.ts) and [CLI tests](../tests/cli.test.ts).
