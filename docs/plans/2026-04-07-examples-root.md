# Examples Root Move Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move the example `tat` files from `tat-cli/examples/` to `examples/` at the repository root and update tracked references so no documented links break.

**Architecture:** The repository keeps the CLI package in `tat-cli/`, but example files become a shared top-level resource in `examples/`. Documentation is updated to describe the new layout, and verification uses tracked-file searches to catch stale references.

**Tech Stack:** Git, Markdown, JSON, YAML

---

### Task 1: Move the example files

**Files:**
- Create: `examples/`
- Move: `tat-cli/examples/httpbin-full.tat.json` -> `examples/httpbin-full.tat.json`
- Move: `tat-cli/examples/httpbin.tat.yml` -> `examples/httpbin.tat.yml`
- Move: `tat-cli/examples/pokeapi-full.tat.json` -> `examples/pokeapi-full.tat.json`
- Move: `tat-cli/examples/setup-test.json` -> `examples/setup-test.json`

**Step 1: Move the tracked files**

Run:
```bash
git mv tat-cli/examples/httpbin-full.tat.json examples/httpbin-full.tat.json
git mv tat-cli/examples/httpbin.tat.yml examples/httpbin.tat.yml
git mv tat-cli/examples/pokeapi-full.tat.json examples/pokeapi-full.tat.json
git mv tat-cli/examples/setup-test.json examples/setup-test.json
```

**Step 2: Verify the move**

Run: `git status --short`
Expected: renamed files from `tat-cli/examples/` into `examples/`

### Task 2: Update tracked docs

**Files:**
- Modify: `README.md`

**Step 1: Update layout documentation**

Change the root README so it describes `examples/` as the shared examples directory instead of listing examples under `tat-cli/`.

**Step 2: Verify references**

Run:
```bash
git grep -n "tat-cli/examples" -- README.md tat-cli/README.md website/index.html docs Rules
```
Expected: no matches

### Task 3: Verify moved filenames remain discoverable

**Files:**
- Verify: `examples/httpbin-full.tat.json`
- Verify: `examples/httpbin.tat.yml`
- Verify: `examples/pokeapi-full.tat.json`
- Verify: `examples/setup-test.json`

**Step 1: Search tracked files for moved example filenames**

Run:
```bash
git grep -n "httpbin-full.tat.json\|httpbin.tat.yml\|pokeapi-full.tat.json\|setup-test.json" -- README.md tat-cli/README.md website/index.html docs Rules
```

Expected: any remaining references point to the new shared examples context, not `tat-cli/examples`
