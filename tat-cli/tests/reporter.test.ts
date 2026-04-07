import { describe, it, expect } from 'vitest';
import { report, multiReport, liveFileHeader } from '../src/reporter.js';
import type { RunResult, MultiRunResult } from '../src/types.js';

const passResult: RunResult = {
  suites: [
    {
      name: 'User API',
      tags: ['smoke'],
      tests: [
        {
          name: 'Get user',
          passed: true,
          assertions: [{ expr: '$status == 200', passed: true }],
          durationMs: 50,
        },
      ],
    },
  ],
  total: 1,
  passed: 1,
  failed: 0,
  skipped: 0,
  durationMs: 55,
};

const failResult: RunResult = {
  suites: [
    {
      name: 'User API',
      tags: [],
      tests: [
        {
          name: 'Get user',
          passed: false,
          assertions: [
            { expr: '$status == 200', passed: true },
            { expr: 'name == "Bob"', passed: false },
          ],
          durationMs: 30,
        },
      ],
    },
  ],
  total: 1,
  passed: 0,
  failed: 1,
  skipped: 0,
  durationMs: 35,
};

describe('report - console', () => {
  it('includes suite name', () => {
    const output = report(passResult, 'console');
    expect(output).toContain('User API');
  });

  it('includes test name', () => {
    const output = report(passResult, 'console');
    expect(output).toContain('Get user');
  });

  it('shows passed summary', () => {
    const output = report(passResult, 'console');
    expect(output).toContain('1 passed');
  });

  it('shows failed assertion expression', () => {
    const output = report(failResult, 'console');
    expect(output).toContain('name == "Bob"');
  });
});

describe('report - json', () => {
  it('returns valid JSON', () => {
    const output = report(passResult, 'json');
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it('contains total and passed counts', () => {
    const parsed = JSON.parse(report(passResult, 'json'));
    expect(parsed.total).toBe(1);
    expect(parsed.passed).toBe(1);
    expect(parsed.failed).toBe(0);
  });
});

describe('report - junit', () => {
  it('returns valid XML header', () => {
    const output = report(passResult, 'junit');
    expect(output).toContain('<?xml version="1.0"');
    expect(output).toContain('<testsuites');
  });

  it('includes testcase element', () => {
    const output = report(passResult, 'junit');
    expect(output).toContain('<testcase name="Get user"');
  });

  it('includes failure element for failed test', () => {
    const output = report(failResult, 'junit');
    expect(output).toContain('<failure');
    expect(output).toContain('name == &quot;Bob&quot;');
  });

  it('escapes XML special characters', () => {
    const result: RunResult = {
      suites: [
        {
          name: 'Suite <&>',
          tags: [],
          tests: [{ name: 'test', passed: true, assertions: [], durationMs: 1 }],
        },
      ],
      total: 1,
      passed: 1,
      failed: 0,
      skipped: 0,
      durationMs: 1,
    };
    const output = report(result, 'junit');
    expect(output).toContain('Suite &lt;&amp;&gt;');
  });
});

describe('report — skipped tests', () => {
  const skippedResult: RunResult = {
    suites: [
      {
        name: 'Suite',
        tags: [],
        tests: [
          { name: 'Active test', passed: true, assertions: [], durationMs: 10 },
          { name: 'Skipped test', passed: false, skipped: true, assertions: [], durationMs: 0 },
        ],
      },
    ],
    total: 2,
    passed: 1,
    failed: 0,
    skipped: 1,
    durationMs: 15,
  };

  it('console: shows ⊘ and (skipped) label for skipped tests', () => {
    const output = report(skippedResult, 'console');
    expect(output).toContain('Skipped test');
    expect(output).toContain('(skipped)');
  });

  it('console: summary includes skipped count', () => {
    const output = report(skippedResult, 'console');
    expect(output).toContain('1 skipped');
  });

  it('junit: skipped test uses <skipped/> element', () => {
    const output = report(skippedResult, 'junit');
    expect(output).toContain('<skipped/>');
  });

  it('junit: skipped attribute on testsuites element', () => {
    const output = report(skippedResult, 'junit');
    expect(output).toContain('skipped="1"');
  });
});

// --- Multi-file reporter tests ---

const multiResult: MultiRunResult = {
  files: [
    {
      file: 'auth.tat.json',
      result: {
        suites: [
          {
            name: 'Auth Suite',
            tags: ['smoke'],
            tests: [
              { name: 'Login', passed: true, assertions: [{ expr: '$status == 200', passed: true }], durationMs: 120 },
            ],
          },
        ],
        total: 1, passed: 1, failed: 0, skipped: 0, durationMs: 120,
      },
    },
    {
      file: 'users.tat.json',
      result: {
        suites: [
          {
            name: 'User CRUD',
            tags: ['users'],
            tests: [
              { name: 'Create user', passed: true, assertions: [], durationMs: 200 },
              { name: 'Delete user', passed: false, assertions: [{ expr: '$status == 204', passed: false }], durationMs: 150 },
            ],
          },
        ],
        total: 2, passed: 1, failed: 1, skipped: 0, durationMs: 350,
      },
    },
  ],
  total: 3, passed: 2, failed: 1, skipped: 0, durationMs: 470,
};

describe('multiReport — console', () => {
  it('includes file names', () => {
    const output = multiReport(multiResult, 'console');
    expect(output).toContain('auth.tat.json');
    expect(output).toContain('users.tat.json');
  });

  it('includes suite and test names', () => {
    const output = multiReport(multiResult, 'console');
    expect(output).toContain('Auth Suite');
    expect(output).toContain('Login');
    expect(output).toContain('User CRUD');
    expect(output).toContain('Delete user');
  });

  it('shows file count in summary', () => {
    const output = multiReport(multiResult, 'console');
    expect(output).toContain('2 files');
  });

  it('shows failed assertion expression', () => {
    const output = multiReport(multiResult, 'console');
    expect(output).toContain('$status == 204');
  });
});

describe('multiReport — json', () => {
  it('returns valid JSON', () => {
    const output = multiReport(multiResult, 'json');
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it('contains files array with correct structure', () => {
    const parsed = JSON.parse(multiReport(multiResult, 'json'));
    expect(parsed.files).toHaveLength(2);
    expect(parsed.files[0].file).toBe('auth.tat.json');
    expect(parsed.total).toBe(3);
    expect(parsed.failed).toBe(1);
  });
});

describe('multiReport — junit', () => {
  it('returns valid XML header', () => {
    const output = multiReport(multiResult, 'junit');
    expect(output).toContain('<?xml version="1.0"');
    expect(output).toContain('<testsuites');
  });

  it('prefixes file name to suite name', () => {
    const output = multiReport(multiResult, 'junit');
    expect(output).toContain('auth.tat.json / Auth Suite');
    expect(output).toContain('users.tat.json / User CRUD');
  });

  it('includes failure element for failed test', () => {
    const output = multiReport(multiResult, 'junit');
    expect(output).toContain('<failure');
    expect(output).toContain('$status == 204');
  });
});

describe('liveFileHeader', () => {
  it('includes file name', () => {
    const output = liveFileHeader('auth.tat.json');
    expect(output).toContain('auth.tat.json');
  });
});
