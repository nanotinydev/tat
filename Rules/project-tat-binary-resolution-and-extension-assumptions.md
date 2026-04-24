---
tags:
  - rule
  - rule/project/tat
created: 2026-04-24
updated: 2026-04-24
scope: project/tat
status: active
---

# Binary resolution order and extension assumptions are stable

## Rule

`vscode-extension/src/tatRunner.ts` must preserve its binary resolution order unless an intentional compatibility change is made:

1. `tat.cliPath`
2. `node_modules/.bin/tat[.cmd]` in the workspace
3. `tat-cli/node_modules/.bin/tat[.cmd]` or `tat-cli/dist/cli.js` in the repo workspace
4. `where tat` / `which tat`
5. `npx @nanotiny/tiny-api-test`

## Enforcement

- Windows behavior is part of the contract; keep `.cmd` handling covered by tests.
- Any change to resolution or stdout parsing assumptions must run through `tests/contracts/` and the extension test suite.
