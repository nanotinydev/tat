import { Command } from 'commander';
import { writeFile, stat, readdir } from 'fs/promises';
import { dirname, resolve, relative, join } from 'path';
import { realpathSync } from 'fs';
import { fileURLToPath } from 'url';
import { loadAndValidate, resolveEnv, runSetup, filterSuites, run, warnUndefinedVars, NoTestsMatchedError } from './runner.js';
import { isTatFile } from './fileFormat.js';
import { report, multiReport, liveTestResult, liveSuiteHeader, liveSummary, liveFileHeader, multiLiveSummary } from './reporter.js';
import type { OutputFormat } from './reporter.js';
import type { RunResult, FileRunResult, MultiRunResult } from './types.js';

const program = new Command();

program
  .name('tat')
  .description('Tiny API Test — JSON/YAML-driven API testing CLI')
  .version(__CLI_VERSION__);

export interface RunCommandOptions {
  tag?: string;
  suite?: string;
  test?: string;
  variables?: string[];
  output: string;
  out?: string;
  bail?: boolean;
  envCmd?: string;
  timeout?: number;
}

/**
 * Recursively discover all *.tat.json / *.tat.yml / *.tat.yaml files in a directory.
 * Returns paths sorted alphabetically relative to the given directory.
 */
export async function discoverTestFiles(dirPath: string): Promise<string[]> {
  const absDir = resolve(dirPath);
  const entries = await readdir(absDir, { recursive: true });
  const tatFiles = entries
    .filter(entry => typeof entry === 'string' && isTatFile(entry))
    .map(entry => join(absDir, entry as string))
    .sort();
  return tatFiles;
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}

function parseManualVariables(entries: string[] | undefined): Record<string, string> {
  const variables: Record<string, string> = {};

  for (const entry of entries ?? []) {
    const separator = entry.indexOf('=');
    if (separator <= 0) {
      throw new Error(`Invalid --variables entry "${entry}". Expected key=value.`);
    }

    const key = entry.slice(0, separator).trim();
    if (key.length === 0) {
      throw new Error(`Invalid --variables entry "${entry}". Expected key=value.`);
    }

    variables[key] = entry.slice(separator + 1);
  }

  return variables;
}

export async function runSingleFile(
  file: string,
  opts: RunCommandOptions,
  callbacks?: {
    onSuiteStart?: (name: string, tags: string[]) => void;
    onTestResult?: (suite: string, result: import('./types.js').TestResult) => void;
  },
): Promise<RunResult | null> {
  const { tatFile, absPath } = await loadAndValidate(file);
  const cwd = dirname(absPath);
  const manualVariables = parseManualVariables(opts.variables);

  // 1. Resolve static env
  let env = await resolveEnv(tatFile.env, absPath);

  // 2. Run setup command from JSON file
  if (tatFile.setup) {
    console.error(`Running setup: ${tatFile.setup}`);
    const setupEnv = await runSetup(tatFile.setup, cwd);
    env = { ...env, ...setupEnv };
  }

  // 3. Run --env-cmd flag
  if (opts.envCmd) {
    console.error(`Running env-cmd: ${opts.envCmd}`);
    const cmdEnv = await runSetup(opts.envCmd, cwd);
    env = { ...env, ...cmdEnv };
  }

  const tags = opts.tag ? opts.tag.split(',').map(t => t.trim()) : undefined;
  const suites = filterSuites(tatFile.suites, { tags, suiteName: opts.suite });

  // Return null if no suites match (caller decides if this is an error)
  if (suites.length === 0) return null;

  // 4. Warn about undefined variables
  const warnings = warnUndefinedVars(suites, { ...env, ...manualVariables });
  for (const w of warnings) console.warn(w);

  // 5. Resolve effective global timeout
  const globalTimeout = opts.timeout ?? tatFile.timeout;

  const result = await run(suites, env, {
    tags,
    suiteName: opts.suite,
    testName: opts.test,
    variables: manualVariables,
    bail: opts.bail,
    timeout: globalTimeout,
    onSuiteStart: callbacks?.onSuiteStart,
    onTestResult: callbacks?.onTestResult,
  });

  return result;
}

async function runDirectory(dirPath: string, opts: RunCommandOptions): Promise<void> {
  const files = await discoverTestFiles(dirPath);

  if (files.length === 0) {
    console.error(`No .tat.json/.tat.yml/.tat.yaml files found in ${dirPath}`);
    process.exit(2);
    return;
  }

  const absDir = resolve(dirPath);
  const isLive = opts.output === 'console' && !opts.out;
  const fileResults: FileRunResult[] = [];
  const start = Date.now();
  let bailed = false;

  for (const file of files) {
    if (bailed) break;

    const relFile = relative(absDir, file);

    if (isLive) {
      process.stdout.write(liveFileHeader(relFile));
    }

    try {
      const result = await runSingleFile(file, { ...opts, bail: opts.bail }, {
        onSuiteStart: isLive
          ? (name, tags) => process.stdout.write(liveSuiteHeader(name, tags))
          : undefined,
        onTestResult: isLive
          ? (_suite, testResult) => process.stdout.write(liveTestResult(testResult))
          : undefined,
      });

      if (result === null) continue; // no matching suites, skip file

      fileResults.push({ file: relFile, result });

      if (opts.bail && result.failed > 0) {
        bailed = true;
      }
    } catch (e) {
      if (e instanceof NoTestsMatchedError) {
        continue; // no matching tests in this file, skip
      }
      throw e;
    }
  }

  if (fileResults.length === 0) {
    console.error('No suites matched the given filters across all files.');
    process.exit(2);
    return;
  }

  const multiResult: MultiRunResult = {
    files: fileResults,
    total: fileResults.reduce((sum, f) => sum + f.result.total, 0),
    passed: fileResults.reduce((sum, f) => sum + f.result.passed, 0),
    failed: fileResults.reduce((sum, f) => sum + f.result.failed, 0),
    skipped: fileResults.reduce((sum, f) => sum + f.result.skipped, 0),
    durationMs: Date.now() - start,
  };

  if (isLive) {
    process.stdout.write(multiLiveSummary(multiResult) + '\n');
  } else {
    const output = multiReport(multiResult, opts.output as OutputFormat);
    if (opts.out) {
      await writeFile(opts.out, output, 'utf-8');
      if (opts.output === 'console') {
        process.stdout.write(output + '\n');
      } else {
        console.log(`Output written to ${opts.out}`);
      }
    } else {
      process.stdout.write(output + '\n');
    }
  }

  process.exit(multiResult.failed > 0 ? 1 : 0);
}

export async function runCommand(file: string, opts: RunCommandOptions): Promise<void> {
  try {
    if (opts.test && !opts.suite) {
      throw new Error('--test requires --suite');
    }

    // Directory mode
    if (await isDirectory(file)) {
      await runDirectory(file, opts);
      return;
    }

    // Single-file mode (existing behavior)
    const isLive = opts.output === 'console' && !opts.out;

    const result = await runSingleFile(file, opts, {
      onSuiteStart: isLive
        ? (name, tags) => process.stdout.write(liveSuiteHeader(name, tags))
        : undefined,
      onTestResult: isLive
        ? (_suite, testResult) => process.stdout.write(liveTestResult(testResult))
        : undefined,
    });

    if (result === null) {
      console.error('No suites matched the given filters.');
      process.exit(2);
      return;
    }

    if (isLive) {
      process.stdout.write(liveSummary(result) + '\n');
    } else {
      const output = report(result, opts.output as OutputFormat);
      if (opts.out) {
        await writeFile(opts.out, output, 'utf-8');
        if (opts.output === 'console') {
          process.stdout.write(output + '\n');
        } else {
          console.log(`Output written to ${opts.out}`);
        }
      } else {
        process.stdout.write(output + '\n');
      }
    }

    process.exit(result.failed > 0 ? 1 : 0);
    return;
  } catch (e) {
    console.error((e as Error).message);
    process.exit(2);
    return;
  }
}

export async function validateCommand(file: string): Promise<void> {
  try {
    // Directory mode
    if (await isDirectory(file)) {
      await validateDirectory(file);
      return;
    }

    // Single-file mode (existing behavior)
    const { tatFile, absPath } = await loadAndValidate(file);
    const env = await resolveEnv(tatFile.env, absPath);
    const warnings = warnUndefinedVars(tatFile.suites, env);

    if (warnings.length > 0) {
      console.log(`${file}: valid (${warnings.length} warning${warnings.length !== 1 ? 's' : ''})`);
      for (const w of warnings) console.warn(w);
    } else {
      console.log(`${file}: valid`);
    }

    process.exit(0);
    return;
  } catch (e) {
    console.error((e as Error).message);
    process.exit(2);
    return;
  }
}

async function validateDirectory(dirPath: string): Promise<void> {
  const files = await discoverTestFiles(dirPath);

  if (files.length === 0) {
    console.error(`No .tat.json/.tat.yml/.tat.yaml files found in ${dirPath}`);
    process.exit(2);
    return;
  }

  const absDir = resolve(dirPath);
  let hasError = false;

  for (const file of files) {
    const relFile = relative(absDir, file);
    try {
      const { tatFile, absPath } = await loadAndValidate(file);
      const env = await resolveEnv(tatFile.env, absPath);
      const warnings = warnUndefinedVars(tatFile.suites, env);

      if (warnings.length > 0) {
        console.log(`${relFile}: valid (${warnings.length} warning${warnings.length !== 1 ? 's' : ''})`);
        for (const w of warnings) console.warn(w);
      } else {
        console.log(`${relFile}: valid`);
      }
    } catch (e) {
      console.error(`${relFile}: ${(e as Error).message}`);
      hasError = true;
    }
  }

  process.exit(hasError ? 2 : 0);
}

program
  .command('run <file>')
  .description('Run API tests from a JSON test file or directory')
  .option('--tag <tags>', 'filter suites by tag, comma-separated (OR logic)')
  .option('--suite <name>', 'run a single suite by name')
  .option('--test <name>', 'run a single test by name (requires --suite)')
  .option('--output <format>', 'output format: console | json | junit', 'console')
  .option('--out <file>', 'write output to a file (useful for json/junit)')
  .option('--bail', 'stop on first test failure')
  .option('--env-cmd <command>', 'run a command before tests; its JSON stdout is merged into env')
  .option('--timeout <ms>', 'request timeout in milliseconds (overrides file-level timeout)', (v) => parseInt(v, 10))
  .option('--variables <key=value>', 'supply a manual variable value for the run; repeatable', (value, acc: string[] = []) => [...acc, value], [])
  .action(runCommand);

program
  .command('validate <file>')
  .description('Validate a test file or directory without running tests')
  .action(validateCommand);

// Only parse when executed directly as a CLI entry point (not imported in tests).
// Resolve symlinks on both sides so `npm link` works correctly on Windows.
function isCLIEntry(): boolean {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return process.argv[1] === fileURLToPath(import.meta.url);
  }
}
if (isCLIEntry()) {
  program.parse();
}
