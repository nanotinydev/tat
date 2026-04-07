# Move Examples To Repo Root Design

## Goal

Move the example `tat` files from `tat-cli/examples/` to a new repository-root `examples/` directory without leaving broken documentation or stale path references.

## Decision

Use a single canonical examples location at `examples/` in the repository root. Update repository documentation that describes the project layout so it reflects the new location.

## Alternatives Considered

1. Keep `tat-cli/examples/` and add a duplicate root folder.
This avoids immediate path churn but creates two sources of truth.

2. Move the files and leave a compatibility stub in `tat-cli/examples/`.
This can help old deep links, but it leaves a dead-end path inside the package directory and adds maintenance overhead.

3. Move the files and update tracked references.
This keeps the layout clean and removes ambiguity. This is the chosen approach.

## Scope

- Create `examples/` at the repository root.
- Move the four tracked example files out of `tat-cli/examples/`.
- Update tracked documentation that says examples live under `tat-cli/`.
- Verify there are no remaining tracked references to `tat-cli/examples`.

## Verification

- Inspect `git diff` for renamed example files and doc updates.
- Search tracked files for `tat-cli/examples`.
- Search tracked files for the moved example filenames to confirm they resolve from `examples/`.
