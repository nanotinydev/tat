import { describe, expect, it } from 'vitest';

import { parseRunOutput } from '../src/tatRunner';

describe('parseRunOutput', () => {
  it('parses valid CLI JSON using the shared runtime contract', () => {
    const parsed = parseRunOutput(
      JSON.stringify({
        suites: [
          {
            name: 'Users',
            tags: [],
            tests: [
              {
                name: 'Get user',
                passed: false,
                assertions: [
                  {
                    expr: '$status == 200',
                    passed: false,
                    actual: [{ operand: '$status', value: 500 }],
                  },
                ],
                durationMs: 12,
                error: 'Request failed',
              },
            ],
          },
        ],
        total: 1,
        passed: 0,
        failed: 1,
        skipped: 0,
        durationMs: 12,
      }),
      'tat run file.tat.json --output json',
    );

    expect(parsed.failed).toBe(1);
    expect(parsed.suites[0].tests[0].assertions[0].actual?.[0]).toEqual({
      operand: '$status',
      value: 500,
    });
  });

  it('throws a helpful error for invalid CLI JSON output', () => {
    expect(() => parseRunOutput('{"failed":"nope"}', 'tat run broken.tat.json --output json')).toThrow(
      'tat output did not match the expected RunResult schema.',
    );
  });

  it('distinguishes malformed JSON from schema validation errors', () => {
    expect(() => parseRunOutput('{not-json', 'tat run broken.tat.json --output json')).toThrow(
      'tat output was not valid JSON.',
    );
  });
});
