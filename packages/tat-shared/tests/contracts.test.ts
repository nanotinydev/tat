import { describe, expect, it, vi, afterEach } from 'vitest';

import {
  AssertionResultSchema,
  RunResultSchema,
  TAT_EXTENSIONS,
  isTatFile,
  parseTatFileContent,
} from '../src/index.js';

describe('tat shared result contracts', () => {
  it('accepts the current CLI RunResult shape', () => {
    const parsed = RunResultSchema.parse({
      suites: [
        {
          name: 'Users',
          tags: ['smoke'],
          tests: [
            {
              name: 'Get user',
              passed: true,
              assertions: [],
              durationMs: 8,
              responseStatus: 200,
              responseBody: { id: 1, name: 'Ada' },
              responseHeaders: { 'content-type': 'application/json' },
            },
          ],
        },
      ],
      total: 1,
      passed: 1,
      failed: 0,
      skipped: 0,
      durationMs: 8,
    });

    expect(parsed.suites[0].tests[0].responseStatus).toBe(200);
  });

  it('rejects invalid actual operand entries', () => {
    expect(() =>
      AssertionResultSchema.parse({
        expr: '$status == 200',
        passed: false,
        actual: [{ operand: 123, value: 500 }],
      }),
    ).toThrow();
  });
});

describe('tat shared file format helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock('yaml');
    vi.resetModules();
  });

  it('tracks the supported tat extensions', () => {
    expect(TAT_EXTENSIONS).toEqual(['.tat.json', '.tat.yml', '.tat.yaml']);
  });

  it('detects tat files across json and yaml variants', () => {
    expect(isTatFile('users.tat.json')).toBe(true);
    expect(isTatFile('users.tat.yml')).toBe(true);
    expect(isTatFile('users.tat.yaml')).toBe(true);
    expect(isTatFile('users.json')).toBe(false);
  });

  it('parses yaml test files with the same helper the CLI and extension use', () => {
    const parsed = parseTatFileContent(
      'users.tat.yml',
      `suites:
  - name: Users
    tests:
      - name: Get user
        method: GET
        url: https://example.test/users/1
        assert:
          - "$status == 200"
`,
    ) as { suites: Array<{ name: string }> };

    expect(parsed.suites[0].name).toBe('Users');
  });

  it('throws a clear unsupported format error', () => {
    expect(() => parseTatFileContent('users.json', '{}')).toThrow(
      'Unsupported file format: users.json',
    );
  });

  it('preserves non-Error JSON parser failures', () => {
    vi.spyOn(JSON, 'parse').mockImplementationOnce(() => {
      throw 'bad json payload';
    });

    expect(() => parseTatFileContent('users.tat.json', '{')).toThrow(
      'Invalid JSON in users.tat.json: bad json payload',
    );
  });

  it('preserves non-Error YAML parser failures', async () => {
    vi.doMock('yaml', () => ({
      parse: () => {
        throw 'bad yaml payload';
      },
    }));

    const { parseTatFileContent: parseTatFileContentWithMockedYaml } = await import('../src/fileFormat.js');

    expect(() => parseTatFileContentWithMockedYaml('users.tat.yml', 'suites: [')).toThrow(
      'Invalid YAML in users.tat.yml: bad yaml payload',
    );
  });
});
