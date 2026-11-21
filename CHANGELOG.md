# Changelog

All notable changes to this project will be documented here.

## [0.3.0]

### Added

- Experimental `--task <description>` mode selects likely relevant source files using task intent, path and source matches, and dependency information.
- `--task ... --output <path>` exports the compiled task context as Markdown with full source, repository-relative paths, and selection rationale. Each path appears once, including task-relevant dependencies.
- `npm run context:bundle` is a development shortcut that exports to `context.md` by default.

### Changed

- Task reports distinguish the selected context from repository dependency diagnostics. Markdown export preserves the existing text and JSON stdout reports.
- The CLI now requires Node.js 22.12 or later due to its Commander dependency.

## [0.1.1] - 2026-10-02

### Added

- GitHub repository, homepage, and issue links in package metadata so npm points at the source repo
- README, contributing guide, changelog, issue templates, and CI workflow

## [0.1.0] - 2026-10-02

### Added

- Repository source scanning
- Estimated token calculation
- Generated-file detection
- Large-file detection
- Dependency graph analysis
- Transitive context analysis
- Context amplification detection
- Combined context analysis for selected files
- CLI and JSON output
- Circular dependency handling
- npm package distribution
