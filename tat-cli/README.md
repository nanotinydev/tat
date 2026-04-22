# tat — Tiny API Test

A JSON/YAML-driven API testing CLI. Write your tests in JSON or YAML, run them with `tat`.

Assertions and captures are powered by [`@nanotiny/json-expression`](https://www.npmjs.com/package/@nanotiny/json-expression).


---

## Installation

```bash
npm install -g @nanotiny/tiny-api-test
```

This exposes the CLI command `tat`.

Or run without installing:

```bash
npx @nanotiny/tiny-api-test run tests.tat.json
```

There is also a VS Code extension for `tat` if you want Test Explorer, CodeLens, and editor integration:

```bash
code --install-extension nanotiny.tat-test-runner
```

To install the public `tat-create` skill:

```bash
npx skills add https://github.com/nanotinydev/tat-skills
```

### What is the `tat-create` skill?

An agent skill is an add-on for an AI coding assistant. It gives the assistant a focused workflow for a specific task instead of relying on a generic prompt.

The `tat-create` skill helps the AI generate `tat` test files for you. Instead of writing `.tat.json` or `.tat.yml` files by hand, you can give the AI an API specification such as:

- an OpenAPI or Swagger file
- endpoint definitions
- request and response examples
- authentication details and expected status codes

Then ask the AI to create a `tat` test file from that specification. The AI can turn the API details into suites, requests, assertions, captures, and authentication flows.

This is especially useful when your API needs a token or login step. The AI can generate a `setup` hook to fetch auth data first, then reuse the returned values in later requests.

Example prompt:

```text
Use tat-create to generate a tat test file from this API specification.
Include login, get user profile, and create order flows.
Use YAML format and add assertions for status codes and key response fields.
If authentication is required, create a setup hook and reuse the token in the test requests.
```

---

## Quick Start

Create a test file in JSON (`tests.tat.json`) or YAML (`tests.tat.yml`):

> **Naming convention:** Use `.tat.json`, `.tat.yml`, or `.tat.yaml` as the file extension (e.g. `users.tat.json`, `smoke.tat.yml`). This makes it easy to identify tat test files at a glance and enables automatic discovery when running a directory.

**JSON:**

```json
{
  "$schema": "https://unpkg.com/@nanotiny/tiny-api-test/schema.json",
  "env": {
    "baseUrl": "https://api.example.com"
  },
  "suites": [
    {
      "name": "User API",
      "tags": ["smoke"],
      "tests": [
        {
          "name": "Get user",
          "method": "GET",
          "url": "{{baseUrl}}/users/1",
          "assert": [
            "$status == 200",
            "name is not null"
          ]
        }
      ]
    }
  ]
}
```

**YAML:**

```yaml
env:
  baseUrl: https://api.example.com

suites:
  - name: User API
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
tat run tests.tat.json
# or
tat run tests.tat.yml
```

Or with `npx`:

```bash
npx @nanotiny/tiny-api-test run tests.tat.json
```

Output:

```
User API [smoke]
  ✔ Get user (142ms)

Results: 1 passed (142ms)
```

---

## Test File Schema

### Top-level structure

**JSON:**

```json
{
  "$schema": "...",
  "env": { ... } | "./path/to/env.json",
  "setup": "node scripts/get-token.js",
  "suites": [ ... ]
}
```

**YAML:**

```yaml
env:
  baseUrl: https://api.example.com
setup: node scripts/get-token.js
suites:
  - ...
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `$schema` | `string` | No | JSON schema URL for editor autocomplete |
| `env` | `object` or `string` | No | Environment variables — inline object or path to a JSON file |
| `setup` | `string` | No | Shell command run before tests. Its JSON stdout is merged into env (see [Authentication](#authentication)) |
| `timeout` | `number` | No | Default request timeout in milliseconds for all tests. Per-test `timeout` overrides this. |
| `suites` | `Suite[]` | Yes | List of test suites |

---

### Suite

**JSON:**

```json
{
  "name": "User API",
  "tags": ["smoke", "users"],
  "tests": [ ... ]
}
```

**YAML:**

```yaml
- name: User API
  tags: [smoke, users]
  tests:
    - ...
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Suite name |
| `tags` | `string[]` | No | Tags used to filter suites via `--tag` |
| `skip` | `boolean` | No | Skip all tests in this suite |
| `tests` | `Test[]` | Yes | List of tests |

---

### Test

**JSON:**

```json
{
  "name": "Create user",
  "method": "POST",
  "url": "{{baseUrl}}/users",
  "headers": {
    "Authorization": "Bearer {{token}}"
  },
  "body": {
    "name": "Alice"
  },
  "assert": [
    "$status == 201",
    "name == 'Alice'",
    "id is not null"
  ],
  "capture": {
    "userId": "id"
  }
}
```

**YAML:**

```yaml
- name: Create user
  method: POST
  url: "{{baseUrl}}/users"
  headers:
    Authorization: "Bearer {{token}}"
  body:
    name: Alice
  assert:
    - "$status == 201"
    - "name == 'Alice'"
    - "id is not null"
  capture:
    userId: id
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Test name |
| `method` | `string` | Yes | HTTP method: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD` |
| `url` | `string` | Yes | Request URL. Supports `{{variable}}` interpolation |
| `headers` | `object` | No | HTTP headers as key-value pairs. Supports `{{variable}}` interpolation |
| `body` | `any` | No | Request body. Objects are sent as JSON with `Content-Type: application/json` |
| `assert` | `string[]` | No | List of assertion expressions (see [Assertions](#assertions)) |
| `capture` | `object` | No | Extract values from the response to use in later tests (see [Capture & Chain](#capture--chain)) |
| `skip` | `boolean` | No | Skip this test without failing the run |
| `timeout` | `number` | No | Request timeout in milliseconds for this test. Overrides the file-level `timeout` and `--timeout` flag. |
| `response` | `true` or `object` | No | Include response status, body, and/or headers in the test output. |

---

## Environment Variables

Define variables to reuse across tests with `{{variable}}` syntax.

**Inline (JSON):**

```json
{
  "env": {
    "baseUrl": "https://api.example.com",
    "token": "abc123"
  }
}
```

**Inline (YAML):**

```yaml
env:
  baseUrl: https://api.example.com
  token: abc123
```

**External file (JSON):**

```json
{
  "env": "./env.local.json"
}
```

**External file (YAML):**

```yaml
env: ./env.local.json
```

`env.local.json`:
```json
{
  "baseUrl": "https://api.example.com",
  "token": "abc123"
}
```

Variables are interpolated in `url`, `headers`, and `body` fields.

You can also inject manual values at run time with repeatable `--variables` flags:

```bash
tat run tests.tat.yml --suite "Workspace flow" --test "Create project" --variables workspaceId=ws-123
tat run tests.tat.yml --variables baseUrl=https://api.example.com --variables token=abc123
```

---

## Undefined Variable Warnings

Before making any HTTP requests, `tat` scans all test fields for `{{variable}}` references and warns about any that are not defined in `env` or produced by a `capture` in a preceding test. This catches typos and missing config early.

```
  [warn] test "Create user": variable "{{token}}" is not defined
```

Warnings do not stop the run. Use `tat validate` to check for them without executing tests.

When you run a single test with `--suite` and `--test`, `tat` keeps that run isolated and does not execute earlier capture-producing tests. If the selected test depends on a missing variable, `tat` fails before making any HTTP call and tells you to either run the suite or pass the value explicitly with `--variables`.

---

## Assertions

Each item in `assert` is an expression string evaluated against the **response context** using `@nanotiny/json-expression`'s `evaluate()` function.

### Response Context

When a response is received, `tat` builds a context object that your assertions run against:

```
Response body: { "id": 1, "name": "Alice" }
Response status: 200
Response headers: { "content-type": "application/json" }
```

Becomes:

```json
{
  "$status": 200,
  "$headers": { "content-type": "application/json" },
  "$body": { "id": 1, "name": "Alice" },
  "$duration": 142,
  "id": 1,
  "name": "Alice"
}
```

- Body fields are spread at the root for ergonomic access (`name == 'Alice'`)
- `$status`, `$headers`, `$body` are always available as special fields
- `$duration` is the HTTP request duration in milliseconds
- When the response body is an **array**, use `$body` to access it (no spreading)

### Assertion Syntax

**Status code:**

JSON: `"assert": ["$status == 200"]`

YAML: `assert: ["$status == 200"]`

**Body field equality:**

JSON: `"assert": ["name == 'Alice'"]`

YAML: `assert: ["name == 'Alice'"]`

**Null checks:**

```json
"assert": [
  "id is not null",
  "deletedAt is null"
]
```

```yaml
assert:
  - "id is not null"
  - "deletedAt is null"
```

**Numeric comparison:**

JSON: `"assert": ["age >= 18"]`

YAML: `assert: ["age >= 18"]`

**String operations:**

```json
"assert": [
  "$headers.content-type contains 'json'",
  "name startswith 'Ali'"
]
```

```yaml
assert:
  - "$headers.content-type contains 'json'"
  - "name startswith 'Ali'"
```

**Multiple assertions (all must pass):**

```json
"assert": [
  "$status == 201",
  "id is not null",
  "name == 'Alice'",
  "role == 'admin'"
]
```

```yaml
assert:
  - "$status == 201"
  - "id is not null"
  - "name == 'Alice'"
  - "role == 'admin'"
```

**Array body:**

When the response body is an array (e.g. `GET /users`), access it via `$body`:

```json
"assert": [
  "$status == 200",
  "$body.name | name == 'Alice' is not null"
]
```

```yaml
assert:
  - "$status == 200"
  - "$body.name | name == 'Alice' is not null"
```

### Full Operator Reference

| Operator | Example | Description |
|----------|---------|-------------|
| `==` | `status == 'active'` | Equals |
| `!=` | `status != 'inactive'` | Not equals |
| `>` | `age > 18` | Greater than |
| `<` | `age < 100` | Less than |
| `>=` | `score >= 90` | Greater than or equal |
| `<=` | `score <= 100` | Less than or equal |
| `is null` | `deletedAt is null` | Value is null or missing |
| `is not null` | `id is not null` | Value exists and is not null |
| `contains` | `bio contains 'engineer'` | String contains substring |
| `startswith` | `name startswith 'Ali'` | String starts with |
| `endswith` | `email endswith '.com'` | String ends with |
| `like` | `name like 'Ali*'` | Wildcard match |
| `in` | `role in 'admin,user'` | Value is in comma-separated list |
| `not in` | `role not in 'banned,guest'` | Value is not in list |
| `between` | `age between 18 and 65` | Value is in range |
| `&&` | `status == 'ok' && code == 0` | Logical AND |
| `\|\|` | `role == 'admin' \|\| role == 'user'` | Logical OR |

---

## Capture & Chain

Use `capture` to extract values from a response and reuse them in subsequent tests.

**JSON:**

```json
{
  "tests": [
    {
      "name": "Create user",
      "method": "POST",
      "url": "{{baseUrl}}/users",
      "body": { "name": "Alice" },
      "assert": ["$status == 201"],
      "capture": {
        "userId": "id"
      }
    },
    {
      "name": "Get the created user",
      "method": "GET",
      "url": "{{baseUrl}}/users/{{userId}}",
      "assert": [
        "$status == 200",
        "name == 'Alice'"
      ]
    },
    {
      "name": "Delete the created user",
      "method": "DELETE",
      "url": "{{baseUrl}}/users/{{userId}}",
      "assert": ["$status == 204"]
    }
  ]
}
```

**YAML:**

```yaml
tests:
  - name: Create user
    method: POST
    url: "{{baseUrl}}/users"
    body:
      name: Alice
    assert:
      - "$status == 201"
    capture:
      userId: id

  - name: Get the created user
    method: GET
    url: "{{baseUrl}}/users/{{userId}}"
    assert:
      - "$status == 200"
      - "name == 'Alice'"

  - name: Delete the created user
    method: DELETE
    url: "{{baseUrl}}/users/{{userId}}"
    assert:
      - "$status == 204"
```

- `capture` keys (`userId`) become available as `{{userId}}` in all following tests within the run
- Capture paths use the same `@nanotiny/json-expression` query syntax as assertions (e.g. `"id"`, `"data.token"`)
- Captures carry forward across suites

### Advanced Capture with Expressions

Capture values support the full [`@nanotiny/json-expression`](https://www.npmjs.com/package/@nanotiny/json-expression) query syntax — the same engine used for assertions. This means you can use filters, `$index`, nested paths, and more.

**Filter by field value:**

JSON: `"capture": { "companyName": "companies.name | id == 'c2'" }`

YAML: `capture: { companyName: "companies.name | id == 'c2'" }`

Captures the `name` from the `companies` array where `id == 'c2'`.

**Capture by array index (`$index`):**

JSON: `"capture": { "thirdCompanyId": "companies.id | $index == 2" }`

YAML: `capture: { thirdCompanyId: "companies.id | $index == 2" }`

Captures the `id` at index 2 (zero-based).

**Nested path capture:**

```json
"capture": {
  "pikachuType": "types.type.name",
  "hpStat": "stats.base_stat | $index == 0"
}
```

```yaml
capture:
  pikachuType: types.type.name
  hpStat: "stats.base_stat | $index == 0"
```

Captures the first `type.name` from nested objects, and `base_stat` at a specific index.

**Complete example — capture from an array response and reuse in a later request:**

**JSON:**

```json
{
  "tests": [
    {
      "name": "Get slideshow data",
      "method": "GET",
      "url": "{{baseUrl}}/json",
      "assert": ["$status == 200"],
      "capture": {
        "author": "slideshow.author",
        "firstSlide": "slideshow.slides.title | $index == 0"
      }
    },
    {
      "name": "Use captured values in next request",
      "method": "GET",
      "url": "{{baseUrl}}/get?author={{author}}&title={{firstSlide}}",
      "assert": [
        "$status == 200",
        "args.author is not null"
      ]
    }
  ]
}
```

**YAML:**

```yaml
tests:
  - name: Get slideshow data
    method: GET
    url: "{{baseUrl}}/json"
    assert:
      - "$status == 200"
    capture:
      author: slideshow.author
      firstSlide: "slideshow.slides.title | $index == 0"

  - name: Use captured values in next request
    method: GET
    url: "{{baseUrl}}/get?author={{author}}&title={{firstSlide}}"
    assert:
      - "$status == 200"
      - "args.author is not null"
```

See the [full operator and syntax reference](https://www.npmjs.com/package/@nanotiny/json-expression) for all supported query expressions.

---

## Skipping Tests

Add `"skip": true` to a test or suite to exclude it from a run without removing it from the file. Skipped tests are shown in the output with a `⊘` symbol and counted separately in the summary.

**Skip a single test:**

**JSON:**

```json
{
  "name": "Flaky test",
  "skip": true,
  "method": "GET",
  "url": "{{baseUrl}}/flaky",
  "assert": ["$status == 200"]
}
```

**YAML:**

```yaml
- name: Flaky test
  skip: true
  method: GET
  url: "{{baseUrl}}/flaky"
  assert:
    - "$status == 200"
```

**Skip an entire suite:**

**JSON:**

```json
{
  "name": "Legacy API",
  "skip": true,
  "tests": [...]
}
```

**YAML:**

```yaml
- name: Legacy API
  skip: true
  tests:
    - ...
```

Console output for a skipped test:
```
My Suite
  ✔ Working test (88ms)
  ⊘ Flaky test (skipped)

Results: 1 passed, 1 skipped (90ms)
```

Skipped tests do not count as failures and do not affect the exit code.

---

## Request Timeout

Set a timeout to fail a test if the server does not respond within the given number of milliseconds.

**Per-test timeout:**

**JSON:**

```json
{
  "name": "Must respond fast",
  "method": "GET",
  "url": "{{baseUrl}}/health",
  "timeout": 2000,
  "assert": ["$status == 200"]
}
```

**YAML:**

```yaml
- name: Must respond fast
  method: GET
  url: "{{baseUrl}}/health"
  timeout: 2000
  assert:
    - "$status == 200"
```

**File-level default (applies to all tests that don't define their own):**

**JSON:**

```json
{
  "timeout": 5000,
  "suites": [...]
}
```

**YAML:**

```yaml
timeout: 5000
suites:
  - ...
```

**Priority:** per-test `timeout` > `--timeout` CLI flag > file-level `timeout` > no timeout.

A timed-out test fails with the error: `Request timed out after Nms`.

---

## Response Time Assertions

The `$duration` field in the assertion context holds the HTTP request duration in milliseconds. Use it to assert on response time:

```json
"assert": [
  "$status == 200",
  "$duration < 500"
]
```

```yaml
assert:
  - "$status == 200"
  - "$duration < 500"
```

`$duration` measures the time from sending the request to receiving the full response body. It does not include test setup or assertion evaluation time.

---

## Response Output

Use the `response` field on a test to include the response status, body, and/or headers in the test output. This is useful for debugging or inspecting API responses without adding assertions.

- `response: true` — include both body and headers
- `response: { status: true }` — include only the response status code
- `response: { body: true }` — include only the response body
- `response: { headers: true }` — include only the response headers

`response: { header: true }` is also accepted as a backwards-compatible alias.

**JSON:**

```json
{
  "name": "Inspect response",
  "method": "GET",
  "url": "{{baseUrl}}/users/1",
  "response": true,
  "assert": ["$status == 200"]
}
```

```json
{
  "name": "Inspect status only",
  "method": "GET",
  "url": "{{baseUrl}}/users/1",
  "response": { "status": true },
  "assert": ["$status == 200"]
}
```

```json
{
  "name": "Inspect body only",
  "method": "GET",
  "url": "{{baseUrl}}/users/1",
  "response": { "body": true },
  "assert": ["$status == 200"]
}
```

```json
{
  "name": "Inspect headers only",
  "method": "GET",
  "url": "{{baseUrl}}/users/1",
  "response": { "headers": true },
  "assert": ["$status == 200"]
}
```

**YAML:**

```yaml
- name: Inspect response
  method: GET
  url: "{{baseUrl}}/users/1"
  response: true
  assert:
    - "$status == 200"
```

```yaml
- name: Inspect status only
  method: GET
  url: "{{baseUrl}}/users/1"
  response:
    status: true
  assert:
    - "$status == 200"
```

```yaml
- name: Inspect body only
  method: GET
  url: "{{baseUrl}}/users/1"
  response:
    body: true
  assert:
    - "$status == 200"
```

```yaml
- name: Inspect headers only
  method: GET
  url: "{{baseUrl}}/users/1"
  response:
    headers: true
  assert:
    - "$status == 200"
```

---

## CLI Reference

### `tat run <file>`

Run tests from a JSON or YAML file, or from a directory (discovers all `.tat.json`, `.tat.yml`, `.tat.yaml` files recursively).

```bash
tat run tests.tat.json
tat run tests.tat.yml
tat run ./tests/          # runs all tat files in the directory
```

**Options:**

| Option | Description |
|--------|-------------|
| `--tag <tags>` | Run only suites matching the given tag(s). Comma-separated for multiple (OR logic). |
| `--suite <name>` | Run a single suite by name. |
| `--output <format>` | Output format: `console` (default), `json`, `junit` |
| `--out <file>` | Write output to a file (useful with `json` or `junit`). |
| `--bail` | Stop on the first test failure. |
| `--env-cmd <command>` | Run a shell command before tests; its JSON stdout is merged into env. Overrides `setup` on conflict. |
| `--timeout <ms>` | Set a global request timeout in milliseconds. Overrides the file-level `timeout`. Per-test `timeout` still takes priority. |
| `--test <name>` | Run a single test by name. Requires `--suite`. |
| `--variables <key=value>` | Supply a manual variable value for the run. Repeat the flag to provide multiple values. Manual values override env, setup, env-cmd, and captured values. |

**Examples:**

```bash
# Run all tests
tat run tests.json

# Run only smoke-tagged suites
tat run tests.json --tag smoke

# Run suites tagged 'smoke' OR 'users'
tat run tests.json --tag smoke,users

# Run a single suite by name
tat run tests.json --suite "User API"

# Run a single test by name
tat run tests.json --suite "User API" --test "Get user"

# Run a single test that needs a captured value
tat run tests.json --suite "Workspace flow" --test "Create project" --variables workspaceId=ws-123

# Output JSON report
tat run tests.json --output json

# Output JUnit XML for CI
tat run tests.json --output junit --out results.xml

# Stop on first failure
tat run tests.json --bail
```

### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | All tests passed |
| `1` | One or more tests failed |
| `2` | Configuration error (bad JSON/YAML, schema error, missing file) |

### `tat validate <file>`

Validate a test file (JSON or YAML) without running any tests. Checks syntax, schema validity, and warns about any `{{variable}}` references that are not defined in `env` or produced by a preceding `capture`.

```bash
tat validate tests.tat.json
tat validate tests.tat.yml
```

Output on success:
```
tests.json: valid
```

Output with undefined variable warnings:
```
tests.json: valid (1 warning)
  [warn] test "Get user": variable "{{token}}" is not defined
```

**Exit codes:** `0` — valid (warnings do not affect exit code), `2` — invalid (bad JSON/YAML, schema error, unreadable env file).

---

## Output Formats

### Console (default)

Human-readable colored output:

```
User API [smoke, users]
  ✔ Get user (142ms)
  ✘ Create user (89ms)
    ✘ name == 'Alice'

Results: 1 passed, 1 failed (231ms)
```

### JSON (`--output json`)

Machine-readable full result object:

```json
{
  "suites": [
    {
      "name": "User API",
      "tags": ["smoke"],
      "tests": [
        {
          "name": "Get user",
          "passed": true,
          "assertions": [
            { "expr": "$status == 200", "passed": true }
          ],
          "durationMs": 142
        }
      ]
    }
  ],
  "total": 1,
  "passed": 1,
  "failed": 0,
  "durationMs": 145
}
```

### JUnit XML (`--output junit`)

Standard JUnit format for CI systems (Jenkins, GitLab CI, and similar tools):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuites tests="1" failures="0" time="0.145">
  <testsuite name="User API" tests="1" failures="0" time="0.142">
    <testcase name="Get user" time="0.142"/>
  </testsuite>
</testsuites>
```

---

## Authentication

### Static token (simplest)

If you already have a token, put it in `env.json` (gitignored) and use `{{token}}` in your tests:

```json
{ "baseUrl": "https://api.example.com", "token": "eyJhbG..." }
```

### OAuth / 2FA — `setup` hook

The `setup` field runs a shell command **before** tests. Its JSON stdout is merged into env. Because `stdin` and `stderr` are inherited from the terminal, **interactive prompts work** — including 2FA OTP entry.

`tests.tat.json`:
```json
{
  "env": { "baseUrl": "https://api.example.com" },
  "setup": "node scripts/get-token.js",
  "suites": [...]
}
```

`tests.tat.yml`:
```yaml
env:
  baseUrl: https://api.example.com
setup: node scripts/get-token.js
suites:
  - ...
```

`scripts/get-token.js`:
```javascript
import readline from 'readline';

// Step 1: Start OAuth flow (password grant or device code)
const authResp = await fetch('https://auth.example.com/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    client_id: process.env.CLIENT_ID,
    client_secret: process.env.CLIENT_SECRET,
    grant_type: 'password',
    username: 'user@example.com',
    password: process.env.PASSWORD,
  }),
});
const { mfa_token } = await authResp.json();

// Step 2: Prompt for OTP — stdin is inherited so this works interactively
const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
const otp = await new Promise(res => rl.question('Enter 2FA code: ', res));
rl.close();

// Step 3: Exchange OTP for access token
const mfaResp = await fetch('https://auth.example.com/oauth/token/mfa', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ mfa_token, otp }),
});
const { access_token } = await mfaResp.json();

// Print JSON to stdout — tat captures this and merges into env
console.log(JSON.stringify({ token: access_token }));
```

Running `tat run tests.json`:
```
Running setup: node scripts/get-token.js
Enter 2FA code: 123456
Protected API
  ✔ Get profile (201ms)
Results: 1 passed (3.2s)
```

### `--env-cmd` flag (CI-friendly)

Same as `setup` but supplied at the CLI level — useful when auth differs per environment without modifying the JSON file:

```bash
# Inject token from a CI secret
tat run tests.json --env-cmd "node scripts/ci-token.js"

# Or inline for simple cases
tat run tests.json --env-cmd "node -e \"console.log(JSON.stringify({token:process.env.API_TOKEN}))\""
```

### Strategy by scenario

| Scenario | Recommended approach |
|----------|---------------------|
| Local dev, token already known | Paste into `env.local.json` (gitignored) |
| Local dev, OAuth + 2FA required | `setup` script with interactive OTP prompt |
| CI/CD with OAuth client credentials | `--env-cmd` calling a non-interactive auth script |
| CI/CD with long-lived API key | `$SECRET` → env file, or `--env-cmd "echo {\"token\":\"$SECRET\"}"` |

---

## CI Integration

### GitHub Actions example

This repository includes a workflow that builds the CLI and runs the large checked-in PokeAPI example as a CI proof:

```yaml
- name: Build CLI
  working-directory: tat-cli
  run: npm run build

- name: Run PokeAPI example with JUnit output
  working-directory: tat-cli
  run: |
    mkdir -p ../artifacts
    node dist/cli.js run ../examples/pokeapi-full.tat.json --output junit --out ../artifacts/pokeapi-example.junit.xml
```

That pattern gives CI systems a real `.tat` file to execute plus a JUnit artifact they can archive or parse.

### Using environment-specific configs

```bash
# Use a different env file per environment
cp env.staging.json env.local.json
tat run tests.json
```

Or pass inline via shell:

```bash
cat > env.local.json <<EOF
{ "baseUrl": "https://staging.api.example.com", "token": "$CI_API_TOKEN" }
EOF
tat run tests.json
```

---

## Full Example

**JSON:**

```json
{
  "$schema": "https://unpkg.com/@nanotiny/tiny-api-test/schema.json",
  "env": {
    "baseUrl": "https://api.example.com",
    "token": "your-api-token"
  },
  "suites": [
    {
      "name": "Auth",
      "tags": ["smoke", "auth"],
      "tests": [
        {
          "name": "Login returns token",
          "method": "POST",
          "url": "{{baseUrl}}/auth/login",
          "body": {
            "username": "alice",
            "password": "secret"
          },
          "assert": [
            "$status == 200",
            "token is not null"
          ],
          "capture": {
            "authToken": "token"
          }
        }
      ]
    },
    {
      "name": "Users",
      "tags": ["users"],
      "tests": [
        {
          "name": "Create user",
          "method": "POST",
          "url": "{{baseUrl}}/users",
          "headers": {
            "Authorization": "Bearer {{authToken}}"
          },
          "body": { "name": "Bob", "role": "user" },
          "assert": [
            "$status == 201",
            "name == 'Bob'",
            "id is not null"
          ],
          "capture": { "userId": "id" }
        },
        {
          "name": "Get user",
          "method": "GET",
          "url": "{{baseUrl}}/users/{{userId}}",
          "headers": {
            "Authorization": "Bearer {{authToken}}"
          },
          "assert": [
            "$status == 200",
            "name == 'Bob'",
            "role == 'user'"
          ]
        },
        {
          "name": "Update user",
          "method": "PUT",
          "url": "{{baseUrl}}/users/{{userId}}",
          "headers": {
            "Authorization": "Bearer {{authToken}}"
          },
          "body": { "name": "Bob Smith" },
          "assert": [
            "$status == 200",
            "name == 'Bob Smith'"
          ]
        },
        {
          "name": "Delete user",
          "method": "DELETE",
          "url": "{{baseUrl}}/users/{{userId}}",
          "headers": {
            "Authorization": "Bearer {{authToken}}"
          },
          "assert": ["$status == 204"]
        }
      ]
    }
  ]
}
```

**YAML:**

```yaml
env:
  baseUrl: https://api.example.com
  token: your-api-token

suites:
  - name: Auth
    tags: [smoke, auth]
    tests:
      - name: Login returns token
        method: POST
        url: "{{baseUrl}}/auth/login"
        body:
          username: alice
          password: secret
        assert:
          - "$status == 200"
          - "token is not null"
        capture:
          authToken: token

  - name: Users
    tags: [users]
    tests:
      - name: Create user
        method: POST
        url: "{{baseUrl}}/users"
        headers:
          Authorization: "Bearer {{authToken}}"
        body:
          name: Bob
          role: user
        assert:
          - "$status == 201"
          - "name == 'Bob'"
          - "id is not null"
        capture:
          userId: id

      - name: Get user
        method: GET
        url: "{{baseUrl}}/users/{{userId}}"
        headers:
          Authorization: "Bearer {{authToken}}"
        assert:
          - "$status == 200"
          - "name == 'Bob'"
          - "role == 'user'"

      - name: Update user
        method: PUT
        url: "{{baseUrl}}/users/{{userId}}"
        headers:
          Authorization: "Bearer {{authToken}}"
        body:
          name: Bob Smith
        assert:
          - "$status == 200"
          - "name == 'Bob Smith'"

      - name: Delete user
        method: DELETE
        url: "{{baseUrl}}/users/{{userId}}"
        headers:
          Authorization: "Bearer {{authToken}}"
        assert:
          - "$status == 204"
```

Run smoke tests only:

```bash
tat run tests.json --tag smoke
```

Run everything and output JUnit for CI:

```bash
tat run tests.json --output junit --out results.xml
```

---

## License

MIT
