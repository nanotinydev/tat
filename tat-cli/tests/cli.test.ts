import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/runner.js', () => ({
  loadAndValidate: vi.fn(),
  resolveEnv: vi.fn(),
  runSetup: vi.fn(),
  filterSuites: vi.fn(),
  run: vi.fn(),
  warnUndefinedVars: vi.fn().mockReturnValue([]),
  NoTestsMatchedError: class extends Error { readonly code = 'NO_TESTS_MATCHED'; },
  MissingVariablesError: class extends Error { readonly code = 'MISSING_VARIABLES'; },
}));

vi.mock('../src/reporter.js', () => ({
  report: vi.fn(),
  multiReport: vi.fn(),
  liveSuiteHeader: vi.fn(),
  liveTestResult: vi.fn(),
  liveSummary: vi.fn(),
  liveFileHeader: vi.fn().mockReturnValue(''),
  multiLiveSummary: vi.fn().mockReturnValue(''),
}));

import { runCommand, validateCommand, discoverTestFiles } from '../src/cli.js';
import * as runner from '../src/runner.js';
import * as reporter from '../src/reporter.js';
import type { RunResult } from '../src/types.js';
import type { Suite } from '../src/types.js';
import { mkdtemp, writeFile, mkdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

const mockSuites: Suite[] = [{ name: 'Suite', tests: [] }];

const passResult: RunResult = {
  suites: [{ name: 'Suite', tags: [], tests: [{ name: 'T', passed: true, assertions: [], durationMs: 10 }] }],
  total: 1, passed: 1, failed: 0, skipped: 0, durationMs: 10,
};

const failResult: RunResult = {
  suites: [{ name: 'Suite', tags: [], tests: [{ name: 'T', passed: false, assertions: [], durationMs: 10 }] }],
  total: 1, passed: 0, failed: 1, skipped: 0, durationMs: 10,
};

describe('runCommand', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.mocked(runner.loadAndValidate).mockResolvedValue({
      tatFile: { suites: mockSuites },
      absPath: '/tmp/test.json',
    });
    vi.mocked(runner.resolveEnv).mockResolvedValue({});
    vi.mocked(runner.filterSuites).mockReturnValue(mockSuites);
    vi.mocked(runner.run).mockResolvedValue(passResult);
    vi.mocked(runner.warnUndefinedVars).mockReturnValue([]);
    vi.mocked(reporter.liveSummary).mockReturnValue('Results: 1 passed');
    vi.mocked(reporter.report).mockReturnValue('console output');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exits with code 0 when all tests pass', async () => {
    await runCommand('test.json', { output: 'console' });
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('exits with code 1 when tests fail', async () => {
    vi.mocked(runner.run).mockResolvedValue(failResult);
    await runCommand('test.json', { output: 'console' });
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('exits with code 2 when no suites match filters', async () => {
    vi.mocked(runner.filterSuites).mockReturnValue([]);
    await runCommand('test.json', { output: 'console' });
    expect(exitSpy).toHaveBeenCalledWith(2);
  });

  it('exits with code 2 on configuration error', async () => {
    vi.mocked(runner.loadAndValidate).mockRejectedValue(new Error('Cannot read file: /bad.json'));
    await runCommand('bad.json', { output: 'console' });
    expect(exitSpy).toHaveBeenCalledWith(2);
  });

  it('runs setup command when tatFile.setup is set', async () => {
    vi.mocked(runner.loadAndValidate).mockResolvedValue({
      tatFile: { suites: mockSuites, setup: 'node get-token.js' },
      absPath: '/tmp/test.json',
    });
    vi.mocked(runner.runSetup).mockResolvedValue({ token: 'from-setup' });
    await runCommand('test.json', { output: 'console' });
    expect(runner.runSetup).toHaveBeenCalledWith('node get-token.js', expect.any(String));
  });

  it('env-cmd runs after setup and overrides conflicting keys', async () => {
    vi.mocked(runner.loadAndValidate).mockResolvedValue({
      tatFile: { suites: mockSuites, setup: 'node setup.js' },
      absPath: '/tmp/test.json',
    });
    vi.mocked(runner.runSetup)
      .mockResolvedValueOnce({ token: 'from-setup', base: 'setup-base' })
      .mockResolvedValueOnce({ token: 'from-cmd' });
    await runCommand('test.json', { output: 'console', envCmd: 'node cmd.js' });
    expect(runner.runSetup).toHaveBeenCalledTimes(2);
    const envPassedToRun = vi.mocked(runner.run).mock.calls[0][1];
    expect(envPassedToRun).toMatchObject({ token: 'from-cmd', base: 'setup-base' });
  });

  it('calls report with json format when --output json', async () => {
    vi.mocked(reporter.report).mockReturnValue('{"total":1}');
    await runCommand('test.json', { output: 'json' });
    expect(reporter.report).toHaveBeenCalledWith(passResult, 'json');
  });

  it('splits comma-separated tags and passes them to filterSuites', async () => {
    await runCommand('test.json', { output: 'console', tag: 'smoke,users' });
    expect(runner.filterSuites).toHaveBeenCalledWith(
      mockSuites,
      expect.objectContaining({ tags: ['smoke', 'users'] }),
    );
  });

  it('passes suite name filter to filterSuites', async () => {
    await runCommand('test.json', { output: 'console', suite: 'My Suite' });
    expect(runner.filterSuites).toHaveBeenCalledWith(
      mockSuites,
      expect.objectContaining({ suiteName: 'My Suite' }),
    );
  });

  it('exits with code 2 when --test is used without --suite', async () => {
    await runCommand('test.json', { output: 'console', test: 'Only Test' });
    expect(console.error).toHaveBeenCalledWith('--test requires --suite');
    expect(exitSpy).toHaveBeenCalledWith(2);
  });

  it('passes --timeout to run as global timeout', async () => {
    await runCommand('test.json', { output: 'console', timeout: 3000 });
    expect(runner.run).toHaveBeenCalledWith(
      mockSuites,
      expect.any(Object),
      expect.objectContaining({ timeout: 3000 }),
    );
  });

  it('uses file-level timeout when --timeout is not set', async () => {
    vi.mocked(runner.loadAndValidate).mockResolvedValue({
      tatFile: { suites: mockSuites, timeout: 5000 },
      absPath: '/tmp/test.json',
    });
    await runCommand('test.json', { output: 'console' });
    expect(runner.run).toHaveBeenCalledWith(
      mockSuites,
      expect.any(Object),
      expect.objectContaining({ timeout: 5000 }),
    );
  });

  it('sets NODE_TLS_REJECT_UNAUTHORIZED only while --insecure run executes', async () => {
    const originalTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;

    try {
      vi.mocked(runner.run).mockImplementation(async () => {
        expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBe('0');
        return passResult;
      });

      await runCommand('test.json', { output: 'console', insecure: true });

      expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBeUndefined();
    } finally {
      if (originalTls === undefined) {
        delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      } else {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalTls;
      }
    }
  });

  it('parses repeated --variables values and passes them to run', async () => {
    await runCommand('test.json', {
      output: 'console',
      variables: ['workspaceId=ws-123', 'projectId=prj-456'],
    });

    expect(runner.run).toHaveBeenCalledWith(
      mockSuites,
      expect.any(Object),
      expect.objectContaining({
        variables: {
          workspaceId: 'ws-123',
          projectId: 'prj-456',
        },
      }),
    );
  });

  it('uses the last repeated --variables value for duplicate keys', async () => {
    await runCommand('test.json', {
      output: 'console',
      variables: ['workspaceId=first', 'workspaceId=second'],
    });

    expect(runner.run).toHaveBeenCalledWith(
      mockSuites,
      expect.any(Object),
      expect.objectContaining({
        variables: {
          workspaceId: 'second',
        },
      }),
    );
  });

  it('stores manual variables in a null-prototype object', async () => {
    await runCommand('test.json', {
      output: 'console',
      variables: ['__proto__=polluted', 'workspaceId=ws-123'],
    });

    const variables = vi.mocked(runner.run).mock.calls[0][2]?.variables as Record<string, string>;
    expect(Object.getPrototypeOf(variables)).toBeNull();
    expect(variables.workspaceId).toBe('ws-123');
    expect(Object.prototype.hasOwnProperty.call(variables, '__proto__')).toBe(true);
    expect(variables.__proto__).toBe('polluted');
  });

  it('exits with code 2 when a --variables entry is malformed', async () => {
    await runCommand('test.json', { output: 'console', variables: ['workspaceId'] });

    expect(console.error).toHaveBeenCalledWith('Invalid --variables entry "workspaceId". Expected key=value.');
    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(runner.run).not.toHaveBeenCalled();
  });

  it('warns about undefined variables before running', async () => {
    vi.mocked(runner.warnUndefinedVars).mockReturnValue(['  [warn] test "T": variable "{{token}}" is not defined']);
    await runCommand('test.json', { output: 'console' });
    expect(runner.warnUndefinedVars).toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('[warn]'));
  });

  it('exits with code 2 when the selected suite contains no matching test', async () => {
    vi.mocked(runner.run).mockRejectedValue(new Error('No tests matched the given filters.'));
    await runCommand('test.json', { output: 'console', suite: 'Suite', test: 'Missing' });
    expect(console.error).toHaveBeenCalledWith('No tests matched the given filters.');
    expect(exitSpy).toHaveBeenCalledWith(2);
  });

  it('surfaces isolated-test missing-variable errors as configuration errors', async () => {
    vi.mocked(runner.run).mockRejectedValue(new Error(
      'Selected test "Create project" in suite "Suite" requires "{{workspaceId}}", which is normally captured by earlier test "Create workspace".',
    ));

    await runCommand('test.json', { output: 'console', suite: 'Suite', test: 'Create project' });

    expect(console.error).toHaveBeenCalledWith(
      'Selected test "Create project" in suite "Suite" requires "{{workspaceId}}", which is normally captured by earlier test "Create workspace".',
    );
    expect(exitSpy).toHaveBeenCalledWith(2);
  });
});

describe('validateCommand', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.mocked(runner.loadAndValidate).mockResolvedValue({
      tatFile: { suites: mockSuites },
      absPath: '/tmp/test.json',
    });
    vi.mocked(runner.resolveEnv).mockResolvedValue({});
    vi.mocked(runner.warnUndefinedVars).mockReturnValue([]);
  });



  afterEach(() => vi.restoreAllMocks());

  it('exits 0 and prints "valid" when file is clean', async () => {
    await validateCommand('test.json');
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('valid'));
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('exits 0 but shows warnings when undefined vars exist', async () => {
    vi.mocked(runner.warnUndefinedVars).mockReturnValue(['  [warn] test "T": variable "{{token}}" is not defined']);
    await validateCommand('test.json');
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('1 warning'));
    expect(console.warn).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('exits 2 on schema validation error', async () => {
    vi.mocked(runner.loadAndValidate).mockRejectedValue(new Error('Schema validation failed'));
    await validateCommand('bad.json');
    expect(exitSpy).toHaveBeenCalledWith(2);
  });
});

describe('discoverTestFiles', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'tat-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('finds .tat.json files recursively', async () => {
    await mkdir(join(tmpDir, 'sub'), { recursive: true });
    await writeFile(join(tmpDir, 'a.tat.json'), '{}');
    await writeFile(join(tmpDir, 'sub', 'b.tat.json'), '{}');
    await writeFile(join(tmpDir, 'not-a-test.json'), '{}');

    const files = await discoverTestFiles(tmpDir);
    expect(files).toHaveLength(2);
    expect(files[0]).toContain('a.tat.json');
    expect(files[1]).toContain('b.tat.json');
  });

  it('returns empty array when no .tat.json files exist', async () => {
    await writeFile(join(tmpDir, 'readme.md'), '# hello');
    const files = await discoverTestFiles(tmpDir);
    expect(files).toHaveLength(0);
  });

  it('returns files sorted alphabetically', async () => {
    await writeFile(join(tmpDir, 'z.tat.json'), '{}');
    await writeFile(join(tmpDir, 'a.tat.json'), '{}');
    await writeFile(join(tmpDir, 'm.tat.json'), '{}');

    const files = await discoverTestFiles(tmpDir);
    expect(files[0]).toContain('a.tat.json');
    expect(files[1]).toContain('m.tat.json');
    expect(files[2]).toContain('z.tat.json');
  });
});

describe('runCommand — directory mode', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'tat-dir-'));
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.mocked(runner.loadAndValidate).mockResolvedValue({
      tatFile: { suites: mockSuites },
      absPath: join(tmpDir, 'test.tat.json'),
    });
    vi.mocked(runner.resolveEnv).mockResolvedValue({});
    vi.mocked(runner.filterSuites).mockReturnValue(mockSuites);
    vi.mocked(runner.run).mockResolvedValue(passResult);
    vi.mocked(runner.warnUndefinedVars).mockReturnValue([]);
    vi.mocked(reporter.multiLiveSummary).mockReturnValue('Results: 1 passed (1 file)');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('exits 2 when directory has no .tat.json files', async () => {
    await writeFile(join(tmpDir, 'readme.md'), '# hello');
    await runCommand(tmpDir, { output: 'console' });
    expect(exitSpy).toHaveBeenCalledWith(2);
  });

  it('runs all .tat.json files in directory and exits 0 on pass', async () => {
    await writeFile(join(tmpDir, 'a.tat.json'), '{}');
    await writeFile(join(tmpDir, 'b.tat.json'), '{}');
    await runCommand(tmpDir, { output: 'console' });
    expect(runner.loadAndValidate).toHaveBeenCalledTimes(2);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('exits 1 when any file has failures', async () => {
    await writeFile(join(tmpDir, 'a.tat.json'), '{}');
    await writeFile(join(tmpDir, 'b.tat.json'), '{}');
    vi.mocked(runner.run)
      .mockResolvedValueOnce(passResult)
      .mockResolvedValueOnce(failResult);
    await runCommand(tmpDir, { output: 'console' });
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('stops on first failure when --bail is set', async () => {
    await writeFile(join(tmpDir, 'a.tat.json'), '{}');
    await writeFile(join(tmpDir, 'b.tat.json'), '{}');
    vi.mocked(runner.run).mockResolvedValue(failResult);
    await runCommand(tmpDir, { output: 'console', bail: true });
    // Only the first file should have been run
    expect(runner.run).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('skips files with no matching suites', async () => {
    await writeFile(join(tmpDir, 'a.tat.json'), '{}');
    await writeFile(join(tmpDir, 'b.tat.json'), '{}');
    vi.mocked(runner.filterSuites)
      .mockReturnValueOnce([])        // a has no matching suites
      .mockReturnValueOnce(mockSuites); // b matches
    await runCommand(tmpDir, { output: 'console' });
    expect(runner.run).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('exits 2 when all files have no matching suites', async () => {
    await writeFile(join(tmpDir, 'a.tat.json'), '{}');
    vi.mocked(runner.filterSuites).mockReturnValue([]);
    await runCommand(tmpDir, { output: 'console' });
    expect(exitSpy).toHaveBeenCalledWith(2);
  });

  it('uses multiReport for non-live json output', async () => {
    await writeFile(join(tmpDir, 'a.tat.json'), '{}');
    vi.mocked(reporter.multiReport).mockReturnValue('{"files":[]}');
    await runCommand(tmpDir, { output: 'json' });
    expect(reporter.multiReport).toHaveBeenCalled();
  });
});

describe('validateCommand — directory mode', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'tat-val-'));
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.mocked(runner.loadAndValidate).mockResolvedValue({
      tatFile: { suites: mockSuites },
      absPath: join(tmpDir, 'test.tat.json'),
    });
    vi.mocked(runner.resolveEnv).mockResolvedValue({});
    vi.mocked(runner.warnUndefinedVars).mockReturnValue([]);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('exits 2 when directory has no .tat.json files', async () => {
    await writeFile(join(tmpDir, 'readme.md'), '# hello');
    await validateCommand(tmpDir);
    expect(exitSpy).toHaveBeenCalledWith(2);
  });

  it('validates all files and exits 0 when all valid', async () => {
    await writeFile(join(tmpDir, 'a.tat.json'), '{}');
    await writeFile(join(tmpDir, 'b.tat.json'), '{}');
    await validateCommand(tmpDir);
    expect(runner.loadAndValidate).toHaveBeenCalledTimes(2);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('exits 2 when any file has validation errors', async () => {
    await writeFile(join(tmpDir, 'a.tat.json'), '{}');
    await writeFile(join(tmpDir, 'b.tat.json'), '{}');
    vi.mocked(runner.loadAndValidate)
      .mockResolvedValueOnce({ tatFile: { suites: mockSuites }, absPath: join(tmpDir, 'a.tat.json') })
      .mockRejectedValueOnce(new Error('Schema validation failed'));
    await validateCommand(tmpDir);
    expect(exitSpy).toHaveBeenCalledWith(2);
  });
});
