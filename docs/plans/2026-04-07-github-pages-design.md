# GitHub Pages Publishing Design

## Goal

Publish the project website to GitHub Pages automatically when changes are pushed to `main`.

## Decision

Keep the website source files in `website/` and configure GitHub Actions to upload that directory as the Pages artifact. This still serves the site from the Pages root URL while avoiding a repository restructure.

## Alternatives Considered

1. Move the website into the repository root.
This would make the deploy path literal, but it would mix site assets with repository metadata and future source directories.

2. Copy `website/` into a temporary staging directory during CI.
This works, but it adds avoidable workflow complexity for a static site.

## Implementation Notes

- Add a workflow at `.github/workflows/deploy-pages.yml`.
- Trigger on pushes to `main` and allow manual dispatch.
- Use the standard Pages actions:
  - `actions/checkout`
  - `actions/configure-pages`
  - `actions/upload-pages-artifact`
  - `actions/deploy-pages`
- Upload the `website/` directory as the artifact path.

## Verification

- Parse the workflow YAML locally.
- Confirm the file appears in `git diff`.
- After push, run the workflow from GitHub Actions or let it trigger from `main`.
