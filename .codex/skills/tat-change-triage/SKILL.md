# tat-change-triage

Use this skill before modifying `tat-cli/`, `vscode-extension/`, or `packages/tat-shared/`.

Checklist:
- Map touched files to affected surfaces: schema, shared contracts, file parsing, CLI flags, exit codes, output shape, binary resolution, extension output formatting.
- If any affected surface crosses package boundaries, require `npm run test:contracts` before completion.
- If `tat-cli/` changes, explicitly decide whether `vscode-extension/` is impacted and record that in the handoff.
- Prefer `npm run verify` as the default repo-wide safety check.
