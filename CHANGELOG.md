# Changelog

## 1.0.1

- Added repeatable `--variables key=value` support for isolated `tat run` test execution
- Fail isolated `--suite` + `--test` runs before any HTTP request when required variables are missing
- VS Code prompts for values normally captured by earlier tests when running a single test
- Improved missing-variable errors with suite names and clearer malformed test/env file messages
- Added prompt-variable coverage for JSON, YAML, external env files, skipped captures, and `setup` handling
- Hardened manual variable parsing with a null-prototype variable map
