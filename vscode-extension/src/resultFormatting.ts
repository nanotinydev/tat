import type { AssertionResult, TestResult } from './types';

function formatActualValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  const json = JSON.stringify(value);
  return json === undefined ? String(value) : json;
}

function formatActuals(assertion: AssertionResult): string {
  if (!assertion.actual || assertion.actual.length === 0) return '';
  const details = assertion.actual
    .map(({ operand, value }) => `${operand}=${formatActualValue(value)}`)
    .join(', ');
  return ` (actual: ${details})`;
}

export function formatFailedAssertion(assertion: AssertionResult): string {
  const errDetail = assertion.error ? `: ${assertion.error}` : '';
  return `${assertion.expr}${formatActuals(assertion)}${errDetail}`;
}

export function formatTestResultResponseLines(testResult: TestResult): string[] {
  const lines: string[] = [];

  if (testResult.responseStatus !== undefined) {
    lines.push(`        Response Status: ${testResult.responseStatus}`);
  }

  if (testResult.responseHeaders) {
    lines.push('        Response Headers:');
    for (const [header, value] of Object.entries(testResult.responseHeaders)) {
      lines.push(`          ${header}: ${value}`);
    }
  }

  if (testResult.responseBody !== undefined) {
    const bodyText = typeof testResult.responseBody === 'string'
      ? testResult.responseBody
      : JSON.stringify(testResult.responseBody, null, 2);
    lines.push('        Response Body:');
    for (const line of bodyText.split('\n')) {
      lines.push(`          ${line}`);
    }
  }

  return lines;
}
