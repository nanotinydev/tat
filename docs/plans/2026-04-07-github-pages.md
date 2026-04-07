# GitHub Pages Workflow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a GitHub Actions workflow that deploys the static website in `website/` to GitHub Pages from `main`.

**Architecture:** The repository keeps website source files in `website/`. GitHub Actions uploads that directory as a Pages artifact and then deploys it with GitHub's standard Pages actions.

**Tech Stack:** GitHub Actions, GitHub Pages, YAML

---

### Task 1: Add the deployment workflow

**Files:**
- Create: `.github/workflows/deploy-pages.yml`

**Step 1: Create the workflow file**

Add a workflow that:
- runs on `push` to `main`
- supports `workflow_dispatch`
- grants `contents: read`, `pages: write`, and `id-token: write`
- uploads `website/` with `actions/upload-pages-artifact`
- deploys with `actions/deploy-pages`

**Step 2: Verify the YAML parses**

Run: `Get-Content -Raw '.github/workflows/deploy-pages.yml' | ConvertFrom-Yaml | Out-Null`
Expected: no error output

**Step 3: Review the diff**

Run: `git diff -- .github/workflows/deploy-pages.yml`
Expected: the workflow shows the correct trigger, permissions, artifact path, and deploy step

### Task 2: Document the design choice

**Files:**
- Create: `docs/plans/2026-04-07-github-pages-design.md`
- Create: `docs/plans/2026-04-07-github-pages.md`

**Step 1: Save the design note**

Record why `website/` remains the source directory and why the workflow uploads that directory directly.

**Step 2: Save the implementation plan**

Record the exact workflow file, validation command, and expected outcome so the deployment setup is easy to maintain later.
