import { describe, expect, it } from 'vitest';

import {
  formatFailedAssertion,
  formatTestResultResponseLines,
} from '../src/resultFormatting';

describe('resultFormatting', () => {
  it('formats failed assertions with inline actual values', () => {
    expect(formatFailedAssertion({
      expr: '$status == 200',
      passed: false,
      actual: [{ operand: '$status', value: 500 }],
    })).toBe('$status == 200 (actual: $status=500)');

    expect(formatFailedAssertion({
      expr: 'name == "Alice"',
      passed: false,
      error: 'query failed',
      actual: [{ operand: 'name', value: 'Bob' }],
    })).toBe('name == "Alice" (actual: name="Bob"): query failed');
  });

  it('formats response status before headers and body', () => {
    expect(formatTestResultResponseLines({
      name: 'Create user',
      passed: true,
      durationMs: 10,
      assertions: [],
      responseStatus: 201,
      responseHeaders: { 'content-type': 'application/json' },
      responseBody: { id: 123 },
    })).toEqual([
      '        Response Status: 201',
      '        Response Headers:',
      '          content-type: application/json',
      '        Response Body:',
      '          {',
      '            "id": 123',
      '          }',
    ]);
  });
});
