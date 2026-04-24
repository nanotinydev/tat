# AGENTS.md

This file provides guidance to AI coding agents when working with code in this repository.

## Commands

```bash
npm install                           # install all workspace deps from the repo root
npm run verify                        # root quality gate: lint + tests + builds + contract harness
npm run test:contracts                # cross-package CLI ↔ extension contract harness
npm --prefix tat-cli run build        # compile with tsup → tat-cli/dist/cli.js
npm --prefix tat-cli run lint         # type-check only (tsc --noEmit)
npm --prefix tat-cli test             # run all tests once (vitest run)
npm --prefix tat-cli run test:watch   # watch mode
npm --prefix tat-cli exec vitest run tests/asserter.test.ts  # run a single test file
npm --prefix vscode-extension run build
npm --prefix vscode-extension run lint
```

`tat-cli/` is the package root for the CLI. Build output is ESM only (`tat-cli/dist/cli.js`) with a `#!/usr/bin/env node` shebang injected by tsup. Entry point is `tat-cli/src/cli.ts`.
`packages/tat-shared/` is the shared internal workspace package for file-format helpers and runtime-validated result contracts consumed by both the CLI and the VS Code extension.

## Cross-Package Impact Rule

Any change in `tat-cli/` must include an explicit check for VS Code extension impact before the work is considered complete.

At minimum, inspect `vscode-extension/` when a CLI change touches:
- public types in `tat-cli/src/types.ts`
- test file validation in `tat-cli/src/schema.ts` or `tat-cli/schema.json`
- `RunResult`, `SuiteResult`, `TestResult`, assertion, capture, response, or JSON output shape
- CLI command names, flags, exit codes, stdout/stderr behavior, or binary resolution assumptions
- `.tat.json`, `.tat.yml`, or `.tat.yaml` parsing behavior
- user-facing output that the extension may mirror in Test Explorer or the output channel

If the extension is affected, update its source, docs, and tests in the same change. Prefer running:

```bash
npm run verify
```

For targeted cross-package checks during development:

```bash
npm --prefix tat-cli exec vitest run vscode-extension/tests --config tat-cli/vitest.config.ts
npm --prefix tat-cli exec vitest run tests/contracts --config tat-cli/vitest.config.ts
```

If the extension is not affected, mention that check in the PR summary or final handoff.

## Architecture

The execution flow for `tat run <file>` is:

1. **`tat-cli/src/cli.ts`** — Commander CLI entry. Exports `runCommand` and `validateCommand` for testability. Uses ESM main guard (`process.argv[1] === fileURLToPath(import.meta.url)`) to prevent `program.parse()` from running when imported in tests. Exit codes: 0 = pass, 1 = test failures, 2 = configuration/file errors or no matching suites.
2. **`packages/tat-shared/src/fileFormat.ts`** — Shared file format detection and parsing. Owns `TAT_EXTENSIONS`, `isTatFile`, `isYamlTatFile`, and `parseTatFileContent` so CLI and extension stay in sync.
3. **`tat-cli/src/runner.ts`** — Core logic: `loadAndValidate` (reads file, delegates parsing to `parseFileContent`, then Zod-validates), `resolveEnv` (inline object or external JSON file), `runSetup` (spawns shell command with `stdin`/`stderr` inherited so interactive prompts work, captures stdout as JSON env), `filterSuites` (tag/name filtering), `warnUndefinedVars` (pre-run scan for undefined `{{variables}}`), `run` (loops suites/tests, handles `skip` and `bail`, merges captures into vars between tests).
4. **`tat-cli/src/asserter.ts`** — Builds the response context object (`$status`, `$headers`, `$body`, `$duration`, plus spread body fields) and evaluates assertion strings via `@nanotiny/json-expression`'s `evaluate()`.
5. **`tat-cli/src/capturer.ts`** — Extracts values from the response context using `@nanotiny/json-expression`'s `query()`; captured values become `{{variable}}` interpolation vars for subsequent tests.
6. **`tat-cli/src/interpolate.ts`** — `{{variable}}` substitution in strings and deep within objects/arrays.
7. **`tat-cli/src/http.ts`** — Thin `fetch` wrapper; auto-sets `Content-Type: application/json` for object bodies. Accepts optional `timeoutMs` and uses `AbortController` to enforce it. Throws `TatRequestError` on network failure or timeout.
8. **`tat-cli/src/reporter.ts`** — Formats `RunResult` as console (colored, with live streaming callbacks), JSON, or JUnit XML. Handles `skipped` tests in all three formats.
9. **`tat-cli/src/schema.ts`** — Zod schema for the test file format.
10. **`packages/tat-shared/src/contracts.ts`** — Shared runtime-validated result schemas and types (`AssertionResult`, `TestResult`, `SuiteResult`, `RunResult`).
11. **`tat-cli/src/types.ts`** — CLI-specific input types (`Suite`, `Test`, `HttpMethod`) plus re-exports of shared result contract types.
12. **`tests/contracts/`** — Cross-package harness that runs the built CLI against JSON/YML/YAML fixtures and validates the output through the extension-side parser/formatter path.

### Assertion and capture expression syntax

Both assertions (`assert`) and capture paths (`capture`) are powered by [`@nanotiny/json-expression`](https://www.npmjs.com/package/@nanotiny/json-expression). Assertions use `evaluate(context, expr)` and captures use `query(context, path)` from the same package. Do not attempt to reimplement or replace this logic — all operator behaviour (`==`, `is not null`, `contains`, `startswith`, `between`, `&&`, `||`, array filters, etc.) is defined by that library.

### Key data flow

Captures accumulate across all suites in a single run. The merged env for each test is `{ ...staticEnv, ...captures }`. The `onSuiteStart` / `onTestResult` callbacks on `run()` are used by the CLI for live console streaming.

## Repo-Local AI Assets

- Repo-local skills live under `.codex/skills/`.
- Durable project memory lives under `Rules/`.
- When making cross-package changes, consult:
  - `.codex/skills/tat-change-triage/SKILL.md`
  - `.codex/skills/tat-contract-guard/SKILL.md`
  - `.codex/skills/tat-harness-engineer/SKILL.md`
  - `.codex/skills/tat-release-check/SKILL.md`
