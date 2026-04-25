import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { findPromptVariables } from '../src/promptVariables';

function writeTatFile(tmpDir: string, fileName: string, data: unknown): string {
  const filePath = path.join(tmpDir, fileName);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  return filePath;
}

function writeTextFile(tmpDir: string, fileName: string, content: string): string {
  const filePath = path.join(tmpDir, fileName);
  fs.writeFileSync(filePath, content);
  return filePath;
}

describe('findPromptVariables', () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it('prompts for values normally captured by earlier tests in the suite', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tat-prompt-vars-'));
    const filePath = writeTatFile(tmpDir, 'sample.tat.json', {
      suites: [
        {
          name: 'Workspace flow',
          tests: [
            {
              name: 'Create workspace',
              url: 'https://api.example.test/workspaces',
              capture: { workspaceId: 'id' },
            },
            {
              name: 'Create project',
              url: 'https://api.example.test/workspaces/{{workspaceId}}/projects',
            },
          ],
        },
      ],
    });

    await expect(findPromptVariables(filePath, 'Workspace flow', 'Create project')).resolves.toEqual([
      { variable: 'workspaceId', sourceTestName: 'Create workspace' },
    ]);
  });

  it('does not prompt for values already defined in env', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tat-prompt-vars-'));
    const filePath = writeTatFile(tmpDir, 'sample.tat.json', {
      env: { workspaceId: 'ws-123' },
      suites: [
        {
          name: 'Workspace flow',
          tests: [
            {
              name: 'Create workspace',
              url: 'https://api.example.test/workspaces',
              capture: { workspaceId: 'id' },
            },
            {
              name: 'Create project',
              url: 'https://api.example.test/workspaces/{{workspaceId}}/projects',
            },
          ],
        },
      ],
    });

    await expect(findPromptVariables(filePath, 'Workspace flow', 'Create project')).resolves.toEqual([]);
  });

  it('ignores captures from skipped earlier tests', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tat-prompt-vars-'));
    const filePath = writeTatFile(tmpDir, 'sample.tat.json', {
      suites: [
        {
          name: 'Workspace flow',
          tests: [
            {
              name: 'Create workspace',
              skip: true,
              url: 'https://api.example.test/workspaces',
              capture: { workspaceId: 'id' },
            },
            {
              name: 'Create project',
              url: 'https://api.example.test/workspaces/{{workspaceId}}/projects',
            },
          ],
        },
      ],
    });

    await expect(findPromptVariables(filePath, 'Workspace flow', 'Create project')).resolves.toEqual([]);
  });

  it('skips prompting entirely when setup is present', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tat-prompt-vars-'));
    const filePath = writeTatFile(tmpDir, 'sample.tat.json', {
      setup: 'node setup.js',
      suites: [
        {
          name: 'Workspace flow',
          tests: [
            {
              name: 'Create project',
              url: 'https://api.example.test/workspaces/{{workspaceId}}/projects',
            },
          ],
        },
      ],
    });

    await expect(findPromptVariables(filePath, 'Workspace flow', 'Create project')).resolves.toBeNull();
  });

  it('parses yaml test files when detecting prompt variables', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tat-prompt-vars-'));
    const filePath = writeTextFile(tmpDir, 'sample.tat.yml', `suites:
  - name: Workspace flow
    tests:
      - name: Create workspace
        url: https://api.example.test/workspaces
        capture:
          workspaceId: id
      - name: Create project
        url: https://api.example.test/workspaces/{{workspaceId}}/projects
`);

    await expect(findPromptVariables(filePath, 'Workspace flow', 'Create project')).resolves.toEqual([
      { variable: 'workspaceId', sourceTestName: 'Create workspace' },
    ]);
  });

  it('loads variables from an external env file before prompting', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tat-prompt-vars-'));
    writeTextFile(tmpDir, 'env.json', JSON.stringify({ workspaceId: 'ws-123' }));
    const filePath = writeTatFile(tmpDir, 'sample.tat.json', {
      env: './env.json',
      suites: [
        {
          name: 'Workspace flow',
          tests: [
            {
              name: 'Create workspace',
              url: 'https://api.example.test/workspaces',
              capture: { workspaceId: 'id' },
            },
            {
              name: 'Create project',
              url: 'https://api.example.test/workspaces/{{workspaceId}}/projects',
            },
          ],
        },
      ],
    });

    await expect(findPromptVariables(filePath, 'Workspace flow', 'Create project')).resolves.toEqual([]);
  });

  it('throws a clear error when the parsed test file shape is missing suites', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tat-prompt-vars-'));
    const filePath = writeTatFile(tmpDir, 'sample.tat.json', { env: { token: 'abc' } });

    await expect(findPromptVariables(filePath, 'Workspace flow', 'Create project')).rejects.toThrow(
      `Invalid test file ${filePath}: expected an object with a suites array.`,
    );
  });

  it('preserves unsupported file format errors from the shared parser', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tat-prompt-vars-'));
    const filePath = writeTextFile(tmpDir, 'sample.json', '{"suites":[]}');

    await expect(findPromptVariables(filePath, 'Workspace flow', 'Create project')).rejects.toThrow(
      `Unsupported file format: ${filePath}`,
    );
  });
});
