---
tags:
  - rule
  - rule/project/tat
created: 2026-04-24
updated: 2026-04-24
scope: project/tat
status: active
---

# CLI exit codes are stable

## Rule

`tat` must preserve this exit code contract unless an explicit breaking change is approved:

- `0` = all selected tests passed
- `1` = test failures, but stdout still contains valid `RunResult` JSON when `--output json` is used
- `2` = configuration, validation, file discovery, or filter-selection errors

## Enforcement

- Any change touching CLI command handling, validation, or stdout/stderr behavior must update `tests/contracts/` if the behavior changes intentionally.
- The VS Code extension relies on the `0/1/2` contract to distinguish test failures from invocation errors.
