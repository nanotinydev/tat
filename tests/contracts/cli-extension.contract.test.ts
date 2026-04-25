import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { formatTestResultResponseLines } from '../../vscode-extension/src/resultFormatting';
import { parseRunOutput } from '../../vscode-extension/src/tatRunner';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixturesDir = path.join(rootDir, 'tests', 'contracts', 'fixtures');
const cliPath = path.join(rootDir, 'tat-cli', 'dist', 'cli.js');

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/users/1') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: 1, name: 'Ada' }));
      return;
    }

    if (req.url === '/fail') {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'boom' }));
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to start contract test server.');
  }

  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
});

async function runTat(args: string[]): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}

describe('CLI and VS Code extension contract harness', () => {
  it('runs the built CLI against a .tat.json fixture and formats the result through extension helpers', async () => {
    const fixture = path.join(fixturesDir, 'contract-pass.tat.json');

    const runResult = await runTat([
      'run',
      fixture,
      '--output',
      'json',
      '--variables',
      `baseUrl=${baseUrl}`,
      '--insecure',
    ]);

    expect(runResult.status).toBe(0);

    const parsed = parseRunOutput(runResult.stdout, `node ${cliPath} run ${fixture} --output json`);
    const testResult = parsed.suites[0].tests[0];

    expect(parsed.total).toBe(1);
    expect(parsed.passed).toBe(1);
    expect(testResult.captures).toEqual({ userId: '1' });

    const responseLines = formatTestResultResponseLines(testResult);
    expect(responseLines).toContain('        Response Status: 200');
    expect(responseLines.some((line) => line.includes('"name": "Ada"'))).toBe(true);
  });

  it('keeps exit code 1 while still emitting valid shared-contract JSON for a failing .tat.yml fixture', async () => {
    const fixture = path.join(fixturesDir, 'contract-fail.tat.yml');
    const runResult = await runTat([
      'run',
      fixture,
      '--output',
      'json',
      '--variables',
      `baseUrl=${baseUrl}`,
    ]);

    expect(runResult.status).toBe(1);

    const parsed = parseRunOutput(runResult.stdout, `node ${cliPath} run ${fixture} --output json`);
    expect(parsed.failed).toBe(1);
    expect(parsed.suites[0].tests[0].assertions[0].expr).toBe('$status == 200');
  });

  it('preserves skipped tests in .tat.yaml and still supports suite/test filters', async () => {
    const fixture = path.join(fixturesDir, 'contract-filter.tat.yaml');

    const fullRun = await runTat([
      'run',
      fixture,
      '--output',
      'json',
      '--variables',
      `baseUrl=${baseUrl}`,
    ]);
    expect(fullRun.status).toBe(0);

    const fullParsed = parseRunOutput(fullRun.stdout, `node ${cliPath} run ${fixture} --output json`);
    expect(fullParsed.total).toBe(2);
    expect(fullParsed.skipped).toBe(1);

    const filteredRun = await runTat([
      'run',
      fixture,
      '--output',
      'json',
      '--suite',
      'Filters',
      '--test',
      'Selected test',
      '--variables',
      `baseUrl=${baseUrl}`,
    ]);

    expect(filteredRun.status).toBe(0);
    const filteredParsed = parseRunOutput(
      filteredRun.stdout,
      `node ${cliPath} run ${fixture} --output json --suite Filters --test "Selected test"`,
    );
    expect(filteredParsed.total).toBe(1);
    expect(filteredParsed.skipped).toBe(0);
    expect(filteredParsed.suites[0].tests[0].name).toBe('Selected test');
  });

  it('emits request errors in the shared result shape for unreachable hosts', async () => {
    const fixture = path.join(fixturesDir, 'request-error.tat.yaml');
    const runResult = await runTat(['run', fixture, '--output', 'json', '--timeout', '200']);

    expect(runResult.status).toBe(1);

    const parsed = parseRunOutput(runResult.stdout, `node ${cliPath} run ${fixture} --output json`);
    expect(parsed.failed).toBe(1);
    expect(parsed.suites[0].tests[0].error).toMatch(/fetch failed|connect|ECONNREFUSED|timeout/i);
  });

  it('keeps validate behavior stable for valid and invalid fixtures', async () => {
    const validFixture = path.join(fixturesDir, 'contract-pass.tat.json');
    const invalidFixture = path.join(fixturesDir, 'invalid.tat.json');

    const validResult = await runTat(['validate', validFixture]);
    expect(validResult.status).toBe(0);
    expect(validResult.stdout).toContain('valid');

    const invalidResult = await runTat(['validate', invalidFixture]);
    expect(invalidResult.status).toBe(2);
    expect(invalidResult.stderr).toContain('Schema validation failed');
  });
});
