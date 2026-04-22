import { readFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { spawn } from 'child_process';
import { TatFileSchema } from './schema.js';
import { interpolate, interpolateDeep } from './interpolate.js';
import { makeRequest, TatRequestError } from './http.js';
import { buildContext, runAssertions } from './asserter.js';
import { runCaptures } from './capturer.js';
import { parseFileContent } from './fileFormat.js';
import { extractVarRefs, findMissingVariablesForSelectedTests, formatMissingVariablesError, type MissingVariable } from './variables.js';
import type { Suite, Test, TestResult, SuiteResult, RunResult } from './types.js';

export class NoTestsMatchedError extends Error {
  readonly code = 'NO_TESTS_MATCHED';

  constructor(message = 'No tests matched the given filters.') {
    super(message);
    this.name = 'NoTestsMatchedError';
  }
}

export class MissingVariablesError extends Error {
  readonly code = 'MISSING_VARIABLES';
  readonly missing: MissingVariable[];

  constructor(missing: MissingVariable[]) {
    super(formatMissingVariablesError(missing));
    this.name = 'MissingVariablesError';
    this.missing = missing;
  }
}

export interface RunOptions {
  tags?: string[];
  suiteName?: string;
  testName?: string;
  variables?: Record<string, string>;
  bail?: boolean;
  timeout?: number;
  insecureTls?: boolean;
  onSuiteStart?: (suiteName: string, tags: string[]) => void;
  onTestResult?: (suiteName: string, result: TestResult) => void;
}

export async function loadAndValidate(filePath: string): Promise<{ tatFile: ReturnType<typeof TatFileSchema.parse>; absPath: string }> {
  const absPath = resolve(filePath);

  let raw: string;
  try {
    raw = await readFile(absPath, 'utf-8');
  } catch {
    throw new Error(`Cannot read file: ${absPath}`);
  }

  const parsed = parseFileContent(absPath, raw);

  const result = TatFileSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map(i => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Schema validation failed:\n${issues}`);
  }

  return { tatFile: result.data, absPath };
}

export async function resolveEnv(
  env: string | Record<string, string> | undefined,
  basePath: string,
): Promise<Record<string, string>> {
  if (!env) return {};
  if (typeof env === 'object') return env;

  const envPath = resolve(dirname(basePath), env);
  let raw: string;
  try {
    raw = await readFile(envPath, 'utf-8');
  } catch {
    throw new Error(`Cannot read env file: ${envPath}`);
  }

  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch (e) {
    throw new Error(`Invalid JSON in env file ${envPath}: ${(e as Error).message}`);
  }
}

export function runSetup(
  command: string,
  cwd: string,
): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    // stdout piped (captures JSON output), stdin + stderr inherited (interactive 2FA prompts work)
    const child = spawn(command, {
      cwd,
      shell: true,
      stdio: ['inherit', 'pipe', 'inherit'],
    });

    let stdout = '';
    child.stdout!.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });

    child.on('close', code => {
      if (code !== 0) {
        return reject(new Error(`setup command exited with code ${code}`));
      }
      const trimmed = stdout.trim();
      if (!trimmed) return resolve({});
      try {
        resolve(JSON.parse(trimmed) as Record<string, string>);
      } catch {
        reject(new Error(`setup command output is not valid JSON:\n${trimmed}`));
      }
    });

    child.on('error', err => reject(new Error(`setup command failed: ${err.message}`)));
  });
}

export function filterSuites(suites: Suite[], opts: RunOptions): Suite[] {
  let result = suites;

  if (opts.suiteName) {
    result = result.filter(s => s.name === opts.suiteName);
  }

  if (opts.tags && opts.tags.length > 0) {
    result = result.filter(s =>
      s.tags && opts.tags!.some(tag => s.tags!.includes(tag)),
    );
  }

  return result;
}

/**
 * Returns warning messages for any {{variable}} references that are not defined
 * in env or produced by a capture in a preceding test. Skipped tests are ignored.
 * Run this before `run()` to surface problems early without making any HTTP calls.
 */
export function warnUndefinedVars(suites: Suite[], env: Record<string, string>): string[] {
  const known = new Set(Object.keys(env));
  const warnings: string[] = [];

  for (const suite of suites) {
    if (suite.skip) continue;
    for (const test of suite.tests) {
      if (test.skip) continue;
      const refs = new Set([
        ...extractVarRefs(test.url),
        ...extractVarRefs(test.headers),
        ...extractVarRefs(test.body),
      ]);
      for (const ref of refs) {
        if (!known.has(ref)) {
          warnings.push(`  [warn] test "${test.name}": variable "{{${ref}}}" is not defined`);
        }
      }
      // Add captures defined by this test so subsequent tests can use them
      if (test.capture) {
        for (const key of Object.keys(test.capture)) known.add(key);
      }
    }
  }

  return warnings;
}

async function runTest(
  test: Test,
  vars: Record<string, string>,
  globalTimeout?: number,
  insecureTls?: boolean,
): Promise<{ result: TestResult; captures: Record<string, string> }> {
  if (test.skip) {
    return {
      result: { name: test.name, passed: false, skipped: true, assertions: [], durationMs: 0 },
      captures: {},
    };
  }

  const start = Date.now();
  const url = interpolate(test.url, vars);
  const headers = test.headers
    ? (interpolateDeep(test.headers, vars) as Record<string, string>)
    : {};
  const body = test.body !== undefined ? interpolateDeep(test.body, vars) : undefined;
  const effectiveTimeout = test.timeout ?? globalTimeout;

  let result: TestResult;
  let captures: Record<string, string> = {};

  try {
    const response = await makeRequest(test.method, url, headers, body, effectiveTimeout, { insecureTls });
    const durationMs = Date.now() - start;
    const context = buildContext(response, durationMs);
    const assertions = runAssertions(context, test.assert);
    captures = test.capture ? runCaptures(context, test.capture) : {};

    const showBody = test.response === true || (typeof test.response === 'object' && test.response.body === true);
    const showHeader = test.response === true || (
      typeof test.response === 'object' && (test.response.headers === true || test.response.header === true)
    );
    const showStatus = typeof test.response === 'object' && test.response.status === true;

    result = {
      name: test.name,
      passed: assertions.every(a => a.passed),
      assertions,
      durationMs,
      ...(Object.keys(captures).length > 0 ? { captures } : {}),
      ...(showStatus ? { responseStatus: response.status } : {}),
      ...(showBody ? { responseBody: response.body } : {}),
      ...(showHeader ? { responseHeaders: response.headers } : {}),
    };
  } catch (e) {
    if (e instanceof TatRequestError) {
      result = {
        name: test.name,
        passed: false,
        assertions: [],
        durationMs: Date.now() - start,
        error: e.message,
      };
    } else {
      throw e;
    }
  }

  return { result, captures };
}

export async function run(
  suites: Suite[],
  env: Record<string, string>,
  opts: RunOptions = {},
): Promise<RunResult> {
  if (opts.testName) {
    const missing = findMissingVariablesForSelectedTests(
      suites,
      env,
      opts.testName,
      opts.variables,
    );
    if (missing.length > 0) {
      throw new MissingVariablesError(missing);
    }
  }

  const start = Date.now();
  const suiteResults: SuiteResult[] = [];
  let captures: Record<string, string> = {};
  let bailed = false;
  let matchedSelectedTest = !opts.testName;

  for (const suite of suites) {
    const selectedTests = opts.testName
      ? suite.tests.filter(test => test.name === opts.testName)
      : suite.tests;
    const testResults: TestResult[] = [];

    opts.onSuiteStart?.(suite.name, suite.tags ?? []);

    if (selectedTests.length > 0) {
      matchedSelectedTest = true;
    }

    if (suite.skip) {
      for (const test of selectedTests) {
        const r: TestResult = { name: test.name, passed: false, skipped: true, assertions: [], durationMs: 0 };
        testResults.push(r);
        opts.onTestResult?.(suite.name, r);
      }
      suiteResults.push({ name: suite.name, tags: suite.tags ?? [], tests: testResults });
      continue;
    }

    for (const test of selectedTests) {
      if (bailed) break;

      const vars = { ...env, ...captures, ...opts.variables };
      const { result, captures: newCaptures } = await runTest(test, vars, opts.timeout, opts.insecureTls);
      testResults.push(result);
      if (!result.skipped) {
        captures = { ...captures, ...newCaptures };
      }
      opts.onTestResult?.(suite.name, result);

      if (opts.bail && !result.passed && !result.skipped) {
        bailed = true;
      }
    }

    suiteResults.push({ name: suite.name, tags: suite.tags ?? [], tests: testResults });

    if (bailed) break;
  }

  if (!matchedSelectedTest) {
    throw new NoTestsMatchedError();
  }

  const allTests = suiteResults.flatMap(s => s.tests);
  const skipped = allTests.filter(t => t.skipped).length;
  const nonSkipped = allTests.filter(t => !t.skipped);
  const passed = nonSkipped.filter(t => t.passed).length;
  const failed = nonSkipped.filter(t => !t.passed).length;

  return {
    suites: suiteResults,
    total: allTests.length,
    passed,
    failed,
    skipped,
    durationMs: Date.now() - start,
  };
}
