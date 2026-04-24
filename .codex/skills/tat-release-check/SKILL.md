# tat-release-check

Use this skill before publish or version-bump changes.

Checklist:
- Run `npm run verify`.
- Run `npm run smoke:packaged-cli` before npm publish.
- Confirm `tat --version` comes from `tat-cli/package.json`.
- Confirm `schema.json` and shared file-format helpers remain aligned.
- Confirm workflow changes keep using `npm ci`, not `npm install`.
