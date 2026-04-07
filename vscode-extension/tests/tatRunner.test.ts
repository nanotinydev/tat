import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const spawnMock = vi.fn();
const execSyncMock = vi.fn();
const execFileMock = vi.fn();

vi.mock('child_process', () => ({
  spawn: spawnMock,
  execSync: execSyncMock,
  execFile: execFileMock,
}));

class FakeChildProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill = vi.fn(() => true);
}

describe('startRunFile', () => {
  beforeEach(() => {
    spawnMock.mockReset();
    execSyncMock.mockReset();
    execFileMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves with parsed JSON output when the child exits successfully', async () => {
    const child = new FakeChildProcess();
    spawnMock.mockReturnValue(child);
    execSyncMock.mockImplementation(() => {
      throw new Error('tat not on PATH');
    });

    const { startRunFile } = await import('../src/tatRunner');
    const handle = startRunFile('/workspace/sample.tat.json', [], {});

    child.stdout.emit('data', Buffer.from('{"passed":1,"failed":0,"skipped":0,"total":1,"durationMs":5,"suites":[]}'));
    child.emit('close', 0);

    await expect(handle.result).resolves.toEqual({
      rawOutput: '{"passed":1,"failed":0,"skipped":0,"total":1,"durationMs":5,"suites":[]}',
      result: {
        passed: 1,
        failed: 0,
        skipped: 0,
        total: 1,
        durationMs: 5,
        suites: [],
      },
    });
  });

  it('rejects quickly on cancellation and attempts to kill the child process', async () => {
    const child = new FakeChildProcess();
    spawnMock.mockReturnValue(child);
    execSyncMock.mockImplementation(() => {
      throw new Error('tat not on PATH');
    });

    const { TatRunCancelledError, startRunFile } = await import('../src/tatRunner');
    const handle = startRunFile('/workspace/sample.tat.json', [], {});
    handle.cancel();

    await expect(handle.result).rejects.toBeInstanceOf(TatRunCancelledError);
    expect(child.kill).toHaveBeenCalledTimes(1);
  });
});

describe('resolveTatBinary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('detects a built tat-cli in the repo root workspace', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tat-workspace-'));
    const builtCli = path.join(workspaceDir, 'tat-cli', 'dist', 'cli.js');
    try {
      fs.mkdirSync(path.dirname(builtCli), { recursive: true });
      fs.writeFileSync(builtCli, '');
      execSyncMock.mockImplementation(() => {
        throw new Error('tat not on PATH');
      });

      const { resolveTatBinary } = await import('../src/tatRunner');

      expect(resolveTatBinary([workspaceDir])).toEqual({
        bin: 'node',
        args: [builtCli],
      });
    } finally {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
  });
});
