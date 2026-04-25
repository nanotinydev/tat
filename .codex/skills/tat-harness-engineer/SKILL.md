# tat-harness-engineer

Use this skill when adding or modifying cross-package fixtures or regression coverage.

Responsibilities:
- Own fixtures under `tests/contracts/fixtures/`.
- Prefer real CLI execution against the built artifact over spawn-only mocks.
- Cover JSON, `.tat.yml`, and `.tat.yaml` paths when contract behavior might drift.
- Route real CLI stdout through extension-side parsing/formatting helpers where possible.
- Keep the harness fast and deterministic; avoid slow external services when a local test server is enough.
