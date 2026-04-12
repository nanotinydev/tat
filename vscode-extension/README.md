# Tiny API Test — VS Code Extension

Run and explore [`tat`](https://www.npmjs.com/package/@nanotiny/tiny-api-test) API test files in VS Code.

## Features

- **Test Explorer** — Suites and tests appear in VS Code's built-in Test Explorer panel with run buttons, pass/fail icons, and inline failure messages.
- **CodeLens** — `Run Suite ▶` and `Run Test ▶` buttons appear inline in `.tat.json`, `.tat.yml`, and `.tat.yaml` files.
- **JSON validation** — Schema-based IntelliSense and error highlighting in `.tat.json` files (powered by the published JSON Schema, no configuration needed).
- **YAML support** — Full support for `.tat.yml` and `.tat.yaml` test files with CodeLens and Test Explorer; use `tat: Validate File` to validate YAML files.
- **Validate command** — `tat: Validate File` from the Command Palette checks JSON or YAML test files without running any HTTP requests.
- **Output channel** — Full `tat` output appears in the *Tiny API Test* output channel.
- **Single-test variable prompt** — When a `Run Test` action depends on a value normally captured by an earlier test, the extension prompts for that variable and forwards it to `tat` via `--variables` when the file does not rely on a `setup` command.

## Requirements

`tat` must be installed in the workspace or globally:

```bash
npm install --save-dev @nanotiny/tiny-api-test
```

Install the public `tat-create` skill with:

```bash
npx skills add https://github.com/nanotinydev/tat-skills
```

### What is the `tat-create` skill?

An agent skill is an add-on for an AI assistant that teaches it how to do one job well. In this case, `tat-create` helps the AI produce `tat` API test files from an API specification.

After installing the skill, you can ask the AI in your editor to create a `.tat.json`, `.tat.yml`, or `.tat.yaml` file by giving it the API specification. That specification can be an OpenAPI document, Swagger content, endpoint list, sample payloads, auth flow, or expected responses.

If the API requires authentication, `tat-create` can also generate tests that use a `setup` hook to fetch a token or other auth values before the suites run.

Example prompt:

```text
Use tat-create to generate a tat test file from this API specification.
Create suites for authentication, user profile, and order creation.
Add assertions for status codes, required fields, and capture any IDs needed by later tests.
If the API needs login, add a setup hook for authentication and reuse the token in later requests.
```

If the binary is not found automatically, set `tat.cliPath` in VS Code Settings to the full path.

When working inside this monorepo, the extension also auto-detects the CLI from `tat-cli/`.

## Test file naming

The extension discovers files matching `**/*.tat.{json,yml,yaml}`. Name your test files with one of these extensions:
- `.tat.json` — JSON format (e.g. `auth.tat.json`)
- `.tat.yml` or `.tat.yaml` — YAML format (e.g. `smoke.tat.yml`)

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `tat.testFilePattern` | `**/*.tat.{json,yml,yaml}` | Glob pattern for discovering test files |
| `tat.cliPath` | *(auto)* | Path to the `tat` binary. Leave empty to auto-detect from `node_modules/.bin/tat`, `tat-cli/`, or `npx tat` |
| `tat.timeout` | `30000` | Timeout in ms for `tat` CLI invocations from the extension |

## Notes

- Running a single test from Test Explorer now keeps the run isolated to that test. Earlier tests in the suite are not executed automatically.
- If the selected test depends on a value normally captured by an earlier test, the extension prompts for it before launching `tat` and forwards it via `--variables` when the file does not use `setup`.
- For files that use `setup`, the extension skips prompting to avoid running `setup` during variable collection. `setup` only covers runtime environment resolution; it does not recreate values captured by earlier tests. When an isolated test requires captured values, run the full suite or pass them manually with `--variables`.
- The output channel shows the raw `--output json` payload from `tat`, useful for debugging.

