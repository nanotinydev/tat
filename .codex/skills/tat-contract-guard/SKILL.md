# tat-contract-guard

Use this skill whenever a change touches any of:
- `packages/tat-shared/src/contracts.ts`
- `tat-cli/src/types.ts`
- `tat-cli/src/schema.ts`
- `tat-cli/src/cli.ts`
- `vscode-extension/src/tatRunner.ts`
- `vscode-extension/src/resultFormatting.ts`

Requirements:
- Update or add contract tests under `tests/contracts/`.
- Keep exit codes `0 / 1 / 2` stable unless the user explicitly requests a breaking change.
- Keep CLI JSON output parseable by `RunResultSchema`.
- If the contract changes intentionally, update extension docs and repo rules in the same change.
