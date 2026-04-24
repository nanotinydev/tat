---
tags:
  - rule
  - rule/project/tat
created: 2026-04-24
updated: 2026-04-24
scope: project/tat
status: active
---

# Test file parsing and schema compatibility must stay aligned

## Rule

The supported file extensions and raw parsing behavior for `.tat.json`, `.tat.yml`, and `.tat.yaml` must remain aligned across:

- `packages/tat-shared/src/fileFormat.ts`
- `tat-cli/src/schema.ts`
- `tat-cli/schema.json`
- `vscode-extension/src/fileParser.ts`
- `vscode-extension/src/promptVariables.ts`

## Enforcement

- Changes to parsing or schema behavior require CLI tests and contract harness updates.
- The extension may add editor-only behavior, but not a divergent parse contract.
