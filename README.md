# tat

`tat` is a tiny API testing tool for people who want fast, file-based HTTP tests without a heavy framework.

Write tests in JSON or YAML. Run them with one command. Assert on status codes and response fields, capture values from one request, and reuse them in the next. It is a good fit for smoke tests, API workflows, local verification, and simple CI checks.

## Why This Exists

Many API testing tools are good, but they often push you toward a GUI, a large test runtime, or a more complex scripting model than you actually need.

`tat` takes a narrower approach:

- plain `.tat.json` and `.tat.yml` files
- simple assertions
- response capture and request chaining
- JSON and JUnit output for CI
- a VS Code extension for Test Explorer and CodeLens support

If you want "Postman-style API checks, but in plain files and easy to version-control", this project is aimed at that space.

## Quick Example

```yaml
env:
  baseUrl: https://api.example.com

suites:
  - name: Users
    tags: [smoke]
    tests:
      - name: Get user
        method: GET
        url: "{{baseUrl}}/users/1"
        assert:
          - "$status == 200"
          - "name is not null"
```

Run it:

```bash
npx @nanotiny/tiny-api-test run users.tat.yml
```

## What You Get

- `tat-cli/` publishes [`@nanotiny/tiny-api-test`](https://www.npmjs.com/package/@nanotiny/tiny-api-test)
- `vscode-extension/` adds Test Explorer, CodeLens, and validation support in VS Code
- `website/` contains the project website
- `docs/` contains internal design notes and implementation plans

## Install

CLI:

```bash
npm install -g @nanotiny/tiny-api-test
```

VS Code extension:

```bash
code --install-extension nanotiny.tat-test-runner
```

## Best For

- API smoke tests checked into a repo
- simple integration flows that need request chaining
- teams that prefer JSON/YAML over test code for common cases
- CI jobs that need console, JSON, or JUnit output

## Project Layout

- `tat-cli/` — core CLI package, schema, examples, and tests
- `vscode-extension/` — VS Code integration for running and validating `tat` files
- `website/` — static project site
- `docs/` — planning documents and design notes

## Common Commands

```bash
npm install
npm run verify
npm run test:contracts

npm --prefix tat-cli run build
npm --prefix tat-cli run lint
npm --prefix tat-cli test

npm --prefix vscode-extension run build
npm --prefix vscode-extension run lint
```

## Where To Start

- CLI usage, schema details, and more examples: [tat-cli/README.md](./tat-cli/README.md)
- VS Code extension details: [vscode-extension/README.md](./vscode-extension/README.md)

## Status

This project is already usable, but still early. The CLI is the most mature part of the repository today. The public surface and positioning will continue to improve as the project gets more real-world usage.

## License

MIT
