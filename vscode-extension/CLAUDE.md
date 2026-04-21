# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build        # bundle src/ → dist/extension.js via esbuild (CJS)
npm run build:watch  # same, with watch mode
npm run lint         # type-check only (tsc --noEmit), no emit
npm run package      # produce tat-test-runner-x.x.x.vsix for distribution
```

Press **F5** in VS Code (with this folder open) to launch an Extension Development Host for manual testing.

## Architecture

This is a VS Code extension that integrates the `tat` CLI into the Test Explorer UI. It is a **separate CJS package** — it must not import from the parent `../src` ESM package at runtime.

### Build

esbuild bundles everything into a single `dist/extension.js`. Key constraints:
- `format: 'cjs'` — VS Code extension host uses `require()`, not ESM.
- `external: ['vscode']` — `vscode` is provided by the host; never bundle it.
- All other deps (currently `yaml` at runtime) are bundled in.

### Source files

| File | Responsibility |
|------|----------------|
| `src/extension.ts` | `activate()` / `deactivate()` — wires `TatTestController`, `TatCodeLensProvider`, and the 4 commands |
| `src/types.ts` | Type-only re-exports of `RunResult`, `SuiteResult`, `TestResult`, `AssertionResult` from `../tat-cli/src/types.ts` — single source of truth, drift caught by `tsc --noEmit` |
| `src/fileParser.ts` | `parseTestFile(text, fileName)` — `JSON.parse` or `yaml.parse` for structure (based on file extension) + sequential regex line scan for `vscode.Range` positions. Also exports `isTatFile()` for extension checking. Uses `yaml` package for YAML parsing. |
| `src/tatRunner.ts` | Invokes the `tat` CLI as a child process via `execFileAsync`. Handles binary resolution, Windows `.cmd` wrapping, exit codes, and JSON parsing. |
| `src/testController.ts` | VS Code Testing API — discovers `*.tat.{json,yml,yaml}` files, builds the TestItem tree (file → suite → test), runs tests, maps results back to TestItems, populates the TEST RESULTS panel via `run.appendOutput()`. |
| `src/codeLens.ts` | `TatCodeLensProvider` — "Run Suite ▶" / "Run Test ▶" CodeLens buttons above each suite and test in `.tat.json`, `.tat.yml`, and `.tat.yaml` files. |

### tat binary resolution (tatRunner.ts)

`resolveTatBinary()` tries in order:
1. `tat.cliPath` setting (if set; `.js` path → runs with `node`)
2. `node_modules/.bin/tat[.cmd]` in each workspace folder
3. `tat-cli/node_modules/.bin/tat[.cmd]` or `tat-cli/dist/cli.js` in the repo root workspace
4. `where tat` / `which tat` on PATH (covers `npm link` and global installs)
5. `npx tat` as last resort

On Windows, `.cmd` files cannot be spawned directly by `execFile` — `resolveExec()` wraps them as `cmd.exe /c <file> <args>`.

### Exit code contract

- Exit 0 → all tests passed; stdout is valid `RunResult` JSON.
- Exit 1 → test failures; stdout **still contains valid `RunResult` JSON** — do not throw.
- Exit 2 → config/validation error; stderr has the message.

### TestItem ID scheme

```
file-level:  <fileUri.toString()>
suite-level: suite::<fileUri>::<suiteName>
test-level:  test::<fileUri>::<suiteName>::<testName>
```

### TEST RESULTS panel

The left pane ("output") is populated with `run.appendOutput()` in `handleRunRequest`. It shows a per-test summary with pass/fail icons, duration, failed assertion details including actual operand values when provided by the CLI, and optional `responseStatus` / `responseHeaders` / `responseBody` when the test's `response` property enables them.

### Key Windows gotchas

- `.cmd` binaries need `cmd.exe /c` — handled by `resolveExec()`.
- `npm link` creates symlinks; `process.argv[1]` in the tat CLI holds the symlink path. The CLI uses `realpathSync` on both sides of the ESM main-guard comparison to handle this.
- `where tat` returns multiple lines (bare name + `.cmd`); the `.cmd` variant is preferred.

## Settings contributed

| Setting | Default | Purpose |
|---------|---------|---------|
| `tat.testFilePattern` | `**/*.tat.{json,yml,yaml}` | Glob for test file discovery |
| `tat.cliPath` | `""` | Override path to tat binary |
| `tat.timeout` | `30000` | CLI invocation timeout (ms) |
