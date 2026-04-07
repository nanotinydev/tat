---
tags:
  - rule
  - rule/project/tat
created: 2026-04-04
updated: 2026-04-04
scope: project/tat
status: active
---

# CLI version must match package.json version

## Rule

The CLI reported version (`tat --version`) must always match the `version` field in `tat-cli/package.json`. Never hardcode a version string in `src/cli.ts`.

## Context

Issue #6 revealed that `src/cli.ts` had a hardcoded `.version('0.1.0')` while `package.json` was at `0.0.3`. This caused user confusion and made release hygiene error-prone. The fix uses tsup's `define` option to inject `__CLI_VERSION__` at build time from `package.json`, so only one source of truth exists. The same define is mirrored in `vitest.config.ts` so tests can import `cli.ts` without error.

## Examples

**Don't:**
```ts
program.version('0.1.0'); // hardcoded - will drift from package.json
```

**Do:**
```ts
program.version(__CLI_VERSION__); // injected from package.json at build time
```
