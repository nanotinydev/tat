import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFile, writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { filterSuites, run, loadAndValidate, resolveEnv, runSetup, warnUndefinedVars, NoTestsMatchedError, MissingVariablesError } from '../src/runner.js';
import type { Suite } from '../src/types.js';

const suites: Suite[] = [
  { name: 'User API', tags: ['smoke', 'users'], tests: [] },
  { name: 'Order API', tags: ['orders'], tests: [] },
  { name: 'Health', tags: ['smoke'], tests: [] },
];

describe('filterSuites', () => {
  it('returns all suites when no filters', () => {
    expect(filterSuites(suites, {})).toHaveLength(3);
  });

  it('filters by suite name', () => {
    const result = filterSuites(suites, { suiteName: 'Order API' });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Order API');
  });

  it('filters by tag (OR logic)', () => {
    const result = filterSuites(suites, { tags: ['smoke'] });
    expect(result).toHaveLength(2);
    expect(result.map(s => s.name)).toContain('User API');
    expect(result.map(s => s.name)).toContain('Health');
  });

  it('filters by multiple tags (OR logic)', () => {
    const result = filterSuites(suites, { tags: ['orders', 'smoke'] });
    expect(result).toHaveLength(3);
  });

  it('returns empty array when no suites match tag', () => {
    const result = filterSuites(suites, { tags: ['nonexistent'] });
    expect(result).toHaveLength(0);
  });

  it('applies suiteName and tag filters together', () => {
    const result = filterSuites(suites, { suiteName: 'User API', tags: ['smoke'] });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('User API');
  });
});

describe('run', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('includes response body and headers when requested by the test definition', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      headers: {
        forEach(cb: (value: string, key: string) => void) {
          cb('application/json', 'content-type');
        },
      },
      text: async () => JSON.stringify({ ok: true }),
    });

    vi.stubGlobal('fetch', fetchMock);

    const suites: Suite[] = [
      {
        name: 'Response output',
        tests: [
          {
            name: 'shows response details',
            method: 'GET',
            url: 'https://example.com/health',
            assert: ['$status == 200'],
            response: true,
          },
        ],
      },
    ];

    const result = await run(suites, {});
    expect(result.suites[0].tests[0].responseBody).toEqual({ ok: true });
    expect(result.suites[0].tests[0].responseHeaders).toEqual({
      'content-type': 'application/json',
    });
    expect(result.suites[0].tests[0].responseStatus).toBeUndefined();
  });

  it('includes response status when explicitly requested by the test definition', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 201,
      headers: {
        forEach(cb: (value: string, key: string) => void) {
          cb('application/json', 'content-type');
        },
      },
      text: async () => JSON.stringify({ ok: true }),
    });

    vi.stubGlobal('fetch', fetchMock);

    const suites: Suite[] = [
      {
        name: 'Response output',
        tests: [
          {
            name: 'shows response status',
            method: 'GET',
            url: 'https://example.com/health',
            assert: ['$status == 201'],
            response: { status: true },
          },
        ],
      },
    ];

    const result = await run(suites, {});
    expect(result.suites[0].tests[0].responseStatus).toBe(201);
    expect(result.suites[0].tests[0].responseBody).toBeUndefined();
    expect(result.suites[0].tests[0].responseHeaders).toBeUndefined();
  });

  it('can include response status with body and headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 202,
      headers: {
        forEach(cb: (value: string, key: string) => void) {
          cb('application/json', 'content-type');
        },
      },
      text: async () => JSON.stringify({ accepted: true }),
    });

    vi.stubGlobal('fetch', fetchMock);

    const suites: Suite[] = [
      {
        name: 'Response output',
        tests: [
          {
            name: 'shows all response details',
            method: 'GET',
            url: 'https://example.com/health',
            assert: ['$status == 202'],
            response: { status: true, body: true, header: true },
          },
        ],
      },
    ];

    const result = await run(suites, {});
    expect(result.suites[0].tests[0].responseStatus).toBe(202);
    expect(result.suites[0].tests[0].responseBody).toEqual({ accepted: true });
    expect(result.suites[0].tests[0].responseHeaders).toEqual({
      'content-type': 'application/json',
    });
  });

  it('can include response headers with the plural response flag', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      headers: {
        forEach(cb: (value: string, key: string) => void) {
          cb('application/json', 'content-type');
        },
      },
      text: async () => JSON.stringify({ ok: true }),
    });

    vi.stubGlobal('fetch', fetchMock);

    const suites: Suite[] = [
      {
        name: 'Response output',
        tests: [
          {
            name: 'shows response headers',
            method: 'GET',
            url: 'https://example.com/health',
            assert: ['$status == 200'],
            response: { headers: true },
          },
        ],
      },
    ];

    const result = await run(suites, {});
    expect(result.suites[0].tests[0].responseHeaders).toEqual({
      'content-type': 'application/json',
    });
    expect(result.suites[0].tests[0].responseBody).toBeUndefined();
  });
});

// Helper to create a temp file and clean it up automatically
async function withTempFile(content: string, fn: (path: string) => Promise<void>, ext = '.tat.json'): Promise<void> {
  const path = join(tmpdir(), `tat-test-${randomBytes(6).toString('hex')}${ext}`);
  await writeFile(path, content, 'utf-8');
  try {
    await fn(path);
  } finally {
    await unlink(path).catch(() => {});
  }
}

describe('loadAndValidate', () => {
  it('parses and validates a valid test file', async () => {
    const content = JSON.stringify({
      suites: [{ name: 'My Suite', tests: [{ name: 'T', method: 'GET', url: 'https://x.com' }] }],
    });
    await withTempFile(content, async (path) => {
      const { tatFile } = await loadAndValidate(path);
      expect(tatFile.suites[0].name).toBe('My Suite');
    });
  });

  it('throws on missing file', async () => {
    await expect(loadAndValidate('/nonexistent/path/test.json')).rejects.toThrow('Cannot read file');
  });

  it('throws on invalid JSON', async () => {
    await withTempFile('not json {{{', async (path) => {
      await expect(loadAndValidate(path)).rejects.toThrow('Invalid JSON');
    });
  });

  it('throws on schema validation failure (missing suites)', async () => {
    await withTempFile(JSON.stringify({ env: {} }), async (path) => {
      await expect(loadAndValidate(path)).rejects.toThrow('Schema validation failed');
    });
  });

  it('throws on invalid HTTP method', async () => {
    const content = JSON.stringify({
      suites: [{ name: 'S', tests: [{ name: 'T', method: 'INVALID', url: 'https://x.com' }] }],
    });
    await withTempFile(content, async (path) => {
      await expect(loadAndValidate(path)).rejects.toThrow('Schema validation failed');
    });
  });

  it('parses and validates a .tat.yml file', async () => {
    const content = `suites:\n  - name: YAML Suite\n    tests:\n      - name: T\n        method: GET\n        url: https://x.com\n`;
    await withTempFile(content, async (path) => {
      const { tatFile } = await loadAndValidate(path);
      expect(tatFile.suites[0].name).toBe('YAML Suite');
    }, '.tat.yml');
  });

  it('parses and validates a .tat.yaml file', async () => {
    const content = `suites:\n  - name: YAML Suite\n    tests:\n      - name: T\n        method: GET\n        url: https://x.com\n`;
    await withTempFile(content, async (path) => {
      const { tatFile } = await loadAndValidate(path);
      expect(tatFile.suites[0].name).toBe('YAML Suite');
    }, '.tat.yaml');
  });

  it('accepts response status output in a test definition', async () => {
    const content = JSON.stringify({
      suites: [{
        name: 'S',
        tests: [{
          name: 'T',
          method: 'GET',
          url: 'https://x.com',
          response: { status: true },
        }],
      }],
    });

    await withTempFile(content, async (path) => {
      const { tatFile } = await loadAndValidate(path);
      expect(tatFile.suites[0].tests[0].response).toEqual({ status: true });
    });
  });

  it('rejects false response status output in a test definition', async () => {
    const content = JSON.stringify({
      suites: [{
        name: 'S',
        tests: [{
          name: 'T',
          method: 'GET',
          url: 'https://x.com',
          response: { status: false },
        }],
      }],
    });

    await withTempFile(content, async (path) => {
      await expect(loadAndValidate(path)).rejects.toThrow('Schema validation failed');
    });
  });

  it('accepts response status with body and header output in a test definition', async () => {
    const content = JSON.stringify({
      suites: [{
        name: 'S',
        tests: [{
          name: 'T',
          method: 'GET',
          url: 'https://x.com',
          response: { status: true, body: true, header: true },
        }],
      }],
    });

    await withTempFile(content, async (path) => {
      const { tatFile } = await loadAndValidate(path);
      expect(tatFile.suites[0].tests[0].response).toEqual({ status: true, body: true, header: true });
    });
  });

  it('accepts response status with body and plural headers output in a test definition', async () => {
    const content = JSON.stringify({
      suites: [{
        name: 'S',
        tests: [{
          name: 'T',
          method: 'GET',
          url: 'https://x.com',
          response: { status: true, body: true, headers: true },
        }],
      }],
    });

    await withTempFile(content, async (path) => {
      const { tatFile } = await loadAndValidate(path);
      expect(tatFile.suites[0].tests[0].response).toEqual({ status: true, body: true, headers: true });
    });
  });

  it('rejects false plural response headers output in a test definition', async () => {
    const content = JSON.stringify({
      suites: [{
        name: 'S',
        tests: [{
          name: 'T',
          method: 'GET',
          url: 'https://x.com',
          response: { headers: false },
        }],
      }],
    });

    await withTempFile(content, async (path) => {
      await expect(loadAndValidate(path)).rejects.toThrow('Schema validation failed');
    });
  });

  it('rejects unknown response output keys in a test definition', async () => {
    const content = JSON.stringify({
      suites: [{
        name: 'S',
        tests: [{
          name: 'T',
          method: 'GET',
          url: 'https://x.com',
          response: { statusCode: true },
        }],
      }],
    });

    await withTempFile(content, async (path) => {
      await expect(loadAndValidate(path)).rejects.toThrow('Schema validation failed');
    });
  });

  it('documents response status in the package JSON schema', async () => {
    const raw = await readFile(new URL('../schema.json', import.meta.url), 'utf-8');
    const schema = JSON.parse(raw) as {
      $defs: {
        Test: {
          properties: {
            response: {
              oneOf: Array<{
                properties?: Record<string, unknown>;
                additionalProperties?: boolean;
              }>;
            };
          };
        };
      };
    };
    const responseObjectSchema = schema.$defs.Test.properties.response.oneOf[1];
    expect(responseObjectSchema.additionalProperties).toBe(false);
    expect(responseObjectSchema.properties?.status).toEqual({
      type: 'boolean',
      enum: [true],
      description: 'Include response status code in output',
    });
    expect(responseObjectSchema.properties?.headers).toEqual({
      type: 'boolean',
      enum: [true],
      description: 'Include response headers in output',
    });
  });

  it('throws on invalid YAML', async () => {
    await withTempFile(':\n  :\n  - :\n  - {', async (path) => {
      await expect(loadAndValidate(path)).rejects.toThrow('Invalid YAML');
    }, '.tat.yml');
  });
});

describe('resolveEnv', () => {
  it('returns empty object when env is undefined', async () => {
    const env = await resolveEnv(undefined, '/any/path.json');
    expect(env).toEqual({});
  });

  it('returns the env object when given an inline object', async () => {
    const env = await resolveEnv({ baseUrl: 'https://api.example.com' }, '/any/path.json');
    expect(env).toEqual({ baseUrl: 'https://api.example.com' });
  });

  it('reads env from a JSON file path', async () => {
    const content = JSON.stringify({ token: 'abc123', baseUrl: 'https://api.example.com' });
    await withTempFile(content, async (envPath) => {
      // resolveEnv resolves relative to basePath directory
      const env = await resolveEnv(envPath, envPath);
      expect(env).toEqual({ token: 'abc123', baseUrl: 'https://api.example.com' });
    });
  });

  it('throws on missing env file', async () => {
    await expect(resolveEnv('./nonexistent-env.json', '/some/test.json')).rejects.toThrow('Cannot read env file');
  });
});

describe('runSetup', () => {
  it('parses JSON stdout from command and returns it as env object', async () => {
    const result = await runSetup(
      `node -e "console.log(JSON.stringify({token:'abc',base:'https://x.com'}))"`,
      process.cwd(),
    );
    expect(result).toEqual({ token: 'abc', base: 'https://x.com' });
  });

  it('returns empty object when command produces no output', async () => {
    const result = await runSetup(`node -e "// no output"`, process.cwd());
    expect(result).toEqual({});
  });

  it('rejects when command exits with non-zero code', async () => {
    await expect(runSetup(`node -e "process.exit(1)"`, process.cwd())).rejects.toThrow('exited with code 1');
  });

  it('rejects when command stdout is not valid JSON', async () => {
    await expect(
      runSetup(`node -e "console.log('not json')"`, process.cwd()),
    ).rejects.toThrow('not valid JSON');
  });
});

describe('run — capture chaining', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('propagates captures from one test to the next as interpolation variables', async () => {
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      callCount++;
      const body = callCount === 1
        ? JSON.stringify({ id: '42', name: 'Alice' })
        : JSON.stringify({ ok: true });
      return Promise.resolve({
        status: 200,
        headers: { forEach: () => {} },
        text: async () => body,
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const captureUrlHolder: string[] = [];
    const suites: Suite[] = [
      {
        name: 'Chain',
        tests: [
          {
            name: 'Create',
            method: 'GET',
            url: 'https://example.com/create',
            assert: [],
            capture: { userId: 'id' },
          },
          {
            name: 'Use capture',
            method: 'GET',
            url: 'https://example.com/users/{{userId}}',
            assert: [],
          },
        ],
      },
    ];

    await run(suites, {});

    // Second call URL should have the captured id substituted
    const secondCallUrl = fetchMock.mock.calls[1][0] as string;
    expect(secondCallUrl).toBe('https://example.com/users/42');
  });

  it('captures carry forward across suites', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
      Promise.resolve({
        status: 200,
        headers: { forEach: () => {} },
        text: async () => JSON.stringify({ token: 'secret' }),
      }),
    ));

    const suites: Suite[] = [
      {
        name: 'Suite A',
        tests: [
          { name: 'Get token', method: 'GET', url: 'https://example.com/token', assert: [], capture: { auth: 'token' } },
        ],
      },
      {
        name: 'Suite B',
        tests: [
          { name: 'Use token', method: 'GET', url: 'https://example.com/{{auth}}', assert: [] },
        ],
      },
    ];

    const fetchMock = vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>);
    await run(suites, {});
    const secondCallUrl = fetchMock.mock.calls[1][0] as string;
    expect(secondCallUrl).toBe('https://example.com/secret');
  });
});

describe('run — bail', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('stops after first failing test when bail is true', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 500,
      headers: { forEach: () => {} },
      text: async () => '{}',
    });
    vi.stubGlobal('fetch', fetchMock);

    const suites: Suite[] = [
      {
        name: 'Suite',
        tests: [
          { name: 'Fail 1', method: 'GET', url: 'https://example.com/a', assert: ['$status == 200'] },
          { name: 'Fail 2', method: 'GET', url: 'https://example.com/b', assert: ['$status == 200'] },
          { name: 'Fail 3', method: 'GET', url: 'https://example.com/c', assert: ['$status == 200'] },
        ],
      },
    ];

    const result = await run(suites, {}, { bail: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.failed).toBe(1);
    expect(result.total).toBe(1);
  });

  it('runs all tests when bail is false', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 500,
      headers: { forEach: () => {} },
      text: async () => '{}',
    });
    vi.stubGlobal('fetch', fetchMock);

    const suites: Suite[] = [
      {
        name: 'Suite',
        tests: [
          { name: 'T1', method: 'GET', url: 'https://example.com/a', assert: ['$status == 200'] },
          { name: 'T2', method: 'GET', url: 'https://example.com/b', assert: ['$status == 200'] },
        ],
      },
    ];

    const result = await run(suites, {}, { bail: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.failed).toBe(2);
  });
});

describe('run — test selection', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('throws when a requested test name does not exist in the selected suites', async () => {
    vi.stubGlobal('fetch', vi.fn());

    const suites: Suite[] = [
      {
        name: 'Suite',
        tests: [
          { name: 'Existing', method: 'GET', url: 'https://example.com/a', assert: [] },
        ],
      },
    ];

    await expect(run(suites, {}, { testName: 'Missing' })).rejects.toThrow(NoTestsMatchedError);
  });

  it('runs only the requested test within the selected suite', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      headers: { forEach: () => {} },
      text: async () => '{}',
    });
    vi.stubGlobal('fetch', fetchMock);

    const suites: Suite[] = [
      {
        name: 'Suite',
        tests: [
          { name: 'First', method: 'GET', url: 'https://example.com/a', assert: [] },
          { name: 'Second', method: 'GET', url: 'https://example.com/b', assert: [] },
        ],
      },
    ];

    const result = await run(suites, {}, { testName: 'Second' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://example.com/b');
    expect(result.total).toBe(1);
    expect(result.suites[0].tests).toHaveLength(1);
    expect(result.suites[0].tests[0].name).toBe('Second');
  });

  it('fails before any HTTP call when the selected test depends on an earlier capture', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const suites: Suite[] = [
      {
        name: 'Suite',
        tests: [
          { name: 'Create workspace', method: 'POST', url: 'https://example.com/workspaces', assert: [], capture: { workspaceId: 'id' } },
          { name: 'Create project', method: 'POST', url: 'https://example.com/workspaces/{{workspaceId}}/projects', assert: [] },
        ],
      },
    ];

    await expect(run(suites, {}, { testName: 'Create project' })).rejects.toThrow(MissingVariablesError);
    await expect(run(suites, {}, { testName: 'Create project' })).rejects.toThrow('{{workspaceId}}');
    await expect(run(suites, {}, { testName: 'Create project' })).rejects.toThrow('Create workspace');
    await expect(run(suites, {}, { testName: 'Create project' })).rejects.toThrow('suite "Suite"');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows manual variables to satisfy an isolated test dependency', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 201,
      headers: { forEach: () => {} },
      text: async () => '{}',
    });
    vi.stubGlobal('fetch', fetchMock);

    const suites: Suite[] = [
      {
        name: 'Suite',
        tests: [
          { name: 'Create workspace', method: 'POST', url: 'https://example.com/workspaces', assert: [], capture: { workspaceId: 'id' } },
          { name: 'Create project', method: 'POST', url: 'https://example.com/workspaces/{{workspaceId}}/projects', assert: [] },
        ],
      },
    ];

    const result = await run(suites, {}, { testName: 'Create project', variables: { workspaceId: 'ws-123' } });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://example.com/workspaces/ws-123/projects');
    expect(result.total).toBe(1);
    expect(result.failed).toBe(0);
  });

  it('lets manual variables override captured values during interpolation', async () => {
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        status: 200,
        headers: { forEach: () => {} },
        text: async () => callCount === 1 ? JSON.stringify({ userId: 'captured-id' }) : '{}',
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const suites: Suite[] = [
      {
        name: 'Suite',
        tests: [
          { name: 'Create', method: 'GET', url: 'https://example.com/create', assert: [], capture: { userId: 'userId' } },
          { name: 'Use manual override', method: 'GET', url: 'https://example.com/users/{{userId}}', assert: [] },
        ],
      },
    ];

    await run(suites, {}, { variables: { userId: 'manual-id' } });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe('https://example.com/users/manual-id');
  });
});

describe('run — skip', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('skips a test with skip: true and makes no HTTP request for it', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      headers: { forEach: () => {} },
      text: async () => '{}',
    });
    vi.stubGlobal('fetch', fetchMock);

    const suites: Suite[] = [
      {
        name: 'Suite',
        tests: [
          { name: 'Active', method: 'GET', url: 'https://example.com/active', assert: [] },
          { name: 'Skipped', method: 'GET', url: 'https://example.com/skip', assert: [], skip: true },
        ],
      },
    ];

    const result = await run(suites, {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.skipped).toBe(1);
    expect(result.passed).toBe(1);
    expect(result.total).toBe(2);
    expect(result.suites[0].tests[1].skipped).toBe(true);
  });

  it('skips all tests in a suite with skip: true', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      headers: { forEach: () => {} },
      text: async () => '{}',
    });
    vi.stubGlobal('fetch', fetchMock);

    const suites: Suite[] = [
      {
        name: 'Skipped Suite',
        skip: true,
        tests: [
          { name: 'T1', method: 'GET', url: 'https://example.com/1', assert: [] },
          { name: 'T2', method: 'GET', url: 'https://example.com/2', assert: [] },
        ],
      },
    ];

    const result = await run(suites, {});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.skipped).toBe(2);
    expect(result.total).toBe(2);
  });
});

describe('warnUndefinedVars', () => {
  it('returns no warnings when all variables are defined', () => {
    const suites: Suite[] = [
      { name: 'S', tests: [{ name: 'T', method: 'GET', url: 'https://{{host}}/path', assert: [] }] },
    ];
    const warnings = warnUndefinedVars(suites, { host: 'example.com' });
    expect(warnings).toHaveLength(0);
  });

  it('warns about undefined variables in URL', () => {
    const suites: Suite[] = [
      { name: 'S', tests: [{ name: 'T', method: 'GET', url: 'https://{{host}}/{{path}}', assert: [] }] },
    ];
    const warnings = warnUndefinedVars(suites, {});
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain('{{host}}');
    expect(warnings[1]).toContain('{{path}}');
  });

  it('does not warn about vars defined by a preceding capture', () => {
    const suites: Suite[] = [
      {
        name: 'S',
        tests: [
          { name: 'Create', method: 'POST', url: 'https://example.com/users', assert: [], capture: { userId: 'id' } },
          { name: 'Get', method: 'GET', url: 'https://example.com/users/{{userId}}', assert: [] },
        ],
      },
    ];
    const warnings = warnUndefinedVars(suites, {});
    expect(warnings).toHaveLength(0);
  });

  it('ignores skipped tests', () => {
    const suites: Suite[] = [
      { name: 'S', tests: [{ name: 'T', method: 'GET', url: 'https://{{token}}/path', assert: [], skip: true }] },
    ];
    const warnings = warnUndefinedVars(suites, {});
    expect(warnings).toHaveLength(0);
  });

  it('ignores skipped suites', () => {
    const suites: Suite[] = [
      { name: 'S', skip: true, tests: [{ name: 'T', method: 'GET', url: 'https://{{token}}/path', assert: [] }] },
    ];
    const warnings = warnUndefinedVars(suites, {});
    expect(warnings).toHaveLength(0);
  });
});
