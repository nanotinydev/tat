import { execFile, execSync, spawn } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import { RunResultSchema } from '@tat/shared';
import { ZodError } from 'zod';
import type { RunResult } from './types';

const execFileAsync = promisify(execFile);

/** Whether the binary needs shell execution (Windows .cmd files can't be spawned directly by execFile). */
function needsShell(bin: string): boolean {
  return process.platform === 'win32' && bin.endsWith('.cmd');
}

/** Quote and escape a string for cmd.exe shell execution. */
function shellQuote(s: string): string {
  return `"${s.replace(/"/g, '""').replace(/%/g, '%%')}"`;
}

/** Find `tat` on PATH using `where` (Windows) or `which` (Unix). Returns undefined if not found. */
function findTatOnPath(): string | undefined {
  try {
    const cmd = process.platform === 'win32' ? 'where tat' : 'which tat';
    const result = execSync(cmd, { encoding: 'utf-8', timeout: 3000 });
    const hits = result.trim().split('\n').map((line) => line.trim()).filter(Boolean);
    if (process.platform === 'win32') {
      const cmdHit = hits.find((hit) => hit.endsWith('.cmd'));
      return cmdHit ?? (hits[0] ? hits[0] + '.cmd' : undefined);
    }
    return hits[0] || undefined;
  } catch {
    return undefined;
  }
}

export interface RunFileOptions {
  suiteName?: string;
  testName?: string;
  variables?: Record<string, string>;
  timeout?: number;
  cliPath?: string;
  cwd?: string;
  insecureTls?: boolean;
}

export interface RunFileResult {
  result: RunResult;
  rawOutput: string;
}

export interface ActiveRunFileHandle {
  result: Promise<RunFileResult>;
  cancel(): void;
}

export function parseRunOutput(stdout: string, command: string): RunResult {
  try {
    const parsedJson = JSON.parse(stdout.trim());
    return RunResultSchema.parse(parsedJson);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(
        `tat output was not valid JSON.\n` +
        `Command: ${command}\n` +
        `Output (first 800 chars):\n${stdout.slice(0, 800)}`,
      );
    }

    if (error instanceof ZodError) {
      throw new Error(
        `tat output did not match the expected RunResult schema.\n` +
        `Command: ${command}\n` +
        `Schema issues:\n${error.issues.map((issue) => `- ${issue.path.join('.') || '<root>'}: ${issue.message}`).join('\n')}\n` +
        `Output (first 800 chars):\n${stdout.slice(0, 800)}`,
      );
    }

    throw new Error(
      `tat output could not be parsed.\n` +
      `Command: ${command}\n` +
      `Output (first 800 chars):\n${stdout.slice(0, 800)}`,
    );
  }
}

export class TatNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TatNotFoundError';
  }
}

export class TatRunCancelledError extends Error {
  constructor(message = 'tat run cancelled') {
    super(message);
    this.name = 'TatRunCancelledError';
  }
}

function resolveWorkspaceTatBinary(folder: string): { bin: string; args: string[] } | undefined {
  const localBin = path.join(folder, 'node_modules', '.bin', 'tat');
  const localBinCmd = localBin + (process.platform === 'win32' ? '.cmd' : '');
  if (fs.existsSync(localBinCmd) || fs.existsSync(localBin)) {
    return { bin: process.platform === 'win32' ? localBinCmd : localBin, args: [] };
  }

  const nestedBin = path.join(folder, 'tat-cli', 'node_modules', '.bin', 'tat');
  const nestedBinCmd = nestedBin + (process.platform === 'win32' ? '.cmd' : '');
  if (fs.existsSync(nestedBinCmd) || fs.existsSync(nestedBin)) {
    return { bin: process.platform === 'win32' ? nestedBinCmd : nestedBin, args: [] };
  }

  const builtCli = path.join(folder, 'tat-cli', 'dist', 'cli.js');
  if (fs.existsSync(builtCli)) {
    return { bin: 'node', args: [builtCli] };
  }

  return undefined;
}

export function resolveTatBinary(
  workspaceFolders: readonly string[],
  configuredPath?: string,
): { bin: string; args: string[] } {
  if (configuredPath && configuredPath.trim() !== '') {
    const configured = configuredPath.trim();
    if (configured.endsWith('.js')) {
      return { bin: 'node', args: [configured] };
    }
    return { bin: configured, args: [] };
  }

  for (const folder of workspaceFolders) {
    const resolved = resolveWorkspaceTatBinary(folder);
    if (resolved) {
      return resolved;
    }
  }

  const globalBin = findTatOnPath();
  if (globalBin) {
    return { bin: globalBin, args: [] };
  }

  return { bin: process.platform === 'win32' ? 'npx.cmd' : 'npx', args: ['@nanotiny/tiny-api-test'] };
}

export async function runFile(
  filePath: string,
  workspaceFolders: readonly string[],
  opts: RunFileOptions = {},
): Promise<RunFileResult> {
  return startRunFile(filePath, workspaceFolders, opts).result;
}

export function startRunFile(
  filePath: string,
  workspaceFolders: readonly string[],
  opts: RunFileOptions = {},
): ActiveRunFileHandle {
  const { bin, args: prefixArgs } = resolveTatBinary(workspaceFolders, opts.cliPath);
  const cwd = opts.cwd ?? path.dirname(filePath);
  const timeout = opts.timeout ?? 30000;
  const args = [
    ...prefixArgs,
    'run',
    filePath,
    '--output', 'json',
    ...(opts.insecureTls ? ['--insecure'] : []),
    ...(opts.suiteName ? ['--suite', opts.suiteName] : []),
    ...(opts.testName ? ['--test', opts.testName] : []),
    ...Object.entries(opts.variables ?? {}).flatMap(([key, value]) => ['--variables', `${key}=${value}`]),
  ];
  const shell = needsShell(bin);
  const execBin = shell ? shellQuote(bin) : bin;
  const execArgs = shell ? args.map(shellQuote) : args;

  let settled = false;
  let cancelled = false;
  let timedOut = false;
  let timeoutHandle: NodeJS.Timeout | undefined;
  let rejectResult: ((reason: Error) => void) | undefined;

  const child = spawn(execBin, execArgs, { cwd, shell });

  const result = new Promise<RunFileResult>((resolve, reject) => {
    rejectResult = reject;
    let stdout = '';
    let stderr = '';

    const resolveOnce = (value: RunFileResult): void => {
      if (settled) return;
      settled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      resolve(value);
    };

    const rejectOnce = (error: Error): void => {
      if (settled) return;
      settled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      reject(error);
    };

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
      if (cancelled) return;
      if (err.code === 'ENOENT') {
        rejectOnce(new TatNotFoundError(
          `tat binary not found at "${bin}". ` +
          `Install locally (npm i -D @nanotiny/tiny-api-test) or set tat.cliPath in settings.`,
        ));
        return;
      }
      rejectOnce(err);
    });

    child.on('close', (code) => {
      if (cancelled || settled) return;

      if (timedOut) {
        rejectOnce(new Error(`tat timed out after ${timeout}ms`));
        return;
      }

      if (code === 0 || (code === 1 && stdout)) {
        try {
          resolveOnce({
            result: parseRunOutput(stdout, `${bin} ${args.join(' ')}`),
            rawOutput: stdout,
          });
        } catch (error) {
          rejectOnce(error instanceof Error ? error : new Error(String(error)));
        }
        return;
      }

      rejectOnce(new Error(stderr.trim() || 'tat invocation failed'));
    });
  });

  timeoutHandle = setTimeout(() => {
    if (settled || cancelled) return;
    timedOut = true;
    try {
      child.kill();
    } catch {
      // Ignore kill failures; close/error handling will finish the promise.
    }
  }, timeout);

  return {
    result,
    cancel() {
      if (settled || cancelled) return;
      cancelled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      try {
        child.kill();
      } catch {
        // Ignore kill failures and reject immediately.
      }
      rejectResult?.(new TatRunCancelledError());
    },
  };
}

export async function validateFile(
  filePath: string,
  workspaceFolders: readonly string[],
  opts: Pick<RunFileOptions, 'cliPath' | 'cwd'> = {},
): Promise<{ valid: boolean; message: string }> {
  const { bin, args: prefixArgs } = resolveTatBinary(workspaceFolders, opts.cliPath);
  const cwd = opts.cwd ?? path.dirname(filePath);
  const execArgs = [...prefixArgs, 'validate', filePath];
  const shell = needsShell(bin);
  const execBin = shell ? shellQuote(bin) : bin;
  const quotedArgs = shell ? execArgs.map(shellQuote) : execArgs;

  try {
    const { stdout } = await execFileAsync(
      execBin,
      quotedArgs,
      { cwd, timeout: 10000, shell },
    );
    return { valid: true, message: stdout.trim() };
  } catch (err: unknown) {
    const execErr = err as NodeJS.ErrnoException & { stderr?: string };
    if (execErr.code === 'ENOENT') {
      throw new TatNotFoundError(`tat binary not found at "${bin}".`);
    }
    return { valid: false, message: execErr.stderr?.trim() ?? 'Validation failed' };
  }
}
