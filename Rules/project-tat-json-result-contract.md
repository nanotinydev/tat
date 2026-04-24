---
tags:
  - rule
  - rule/project/tat
created: 2026-04-24
updated: 2026-04-24
scope: project/tat
status: active
---

# JSON result shape comes from the shared contract

## Rule

`AssertionResult`, `TestResult`, `SuiteResult`, and `RunResult` are owned by `packages/tat-shared/src/contracts.ts`.

## Enforcement

- The CLI must keep `--output json` compatible with `RunResultSchema`.
- The extension must validate CLI JSON with `RunResultSchema` instead of assuming shape by convention.
- Any intentional contract change must update `tests/contracts/`, extension formatting/parsing, and relevant docs in the same change.
