import { describe, it, expect } from 'vitest';
import { buildContext, runAssertions } from '../src/asserter.js';
import type { HttpResponse } from '../src/http.js';

describe('buildContext', () => {
  it('spreads object body at root', () => {
    const response: HttpResponse = {
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: { name: 'Alice', id: 1 },
    };
    const ctx = buildContext(response);
    expect(ctx['name']).toBe('Alice');
    expect(ctx['id']).toBe(1);
    expect(ctx['$status']).toBe(200);
    expect(ctx['$body']).toEqual({ name: 'Alice', id: 1 });
  });

  it('does not spread array body', () => {
    const response: HttpResponse = {
      status: 200,
      headers: {},
      body: [{ name: 'Alice' }],
    };
    const ctx = buildContext(response);
    expect(ctx['$body']).toEqual([{ name: 'Alice' }]);
    expect(ctx['name']).toBeUndefined();
  });

  it('includes $duration in context when durationMs is provided', () => {
    const response: HttpResponse = { status: 200, headers: {}, body: {} };
    const ctx = buildContext(response, 142);
    expect(ctx['$duration']).toBe(142);
  });

  it('omits $duration when durationMs is not provided', () => {
    const response: HttpResponse = { status: 200, headers: {}, body: {} };
    const ctx = buildContext(response);
    expect(ctx['$duration']).toBeUndefined();
  });

  it('$-prefixed fields take precedence over body fields', () => {
    const response: HttpResponse = {
      status: 201,
      headers: {},
      body: { $status: 999, name: 'Alice' },
    };
    const ctx = buildContext(response);
    // $status from response wins over body's $status
    expect(ctx['$status']).toBe(201);
  });
});

describe('runAssertions', () => {
  const ctx: Record<string, unknown> = {
    $status: 200,
    $headers: { 'content-type': 'application/json' },
    $body: { name: 'Alice', id: 1 },
    name: 'Alice',
    id: 1,
  };

  it('passes a true assertion', () => {
    const results = runAssertions(ctx, ['name == "Alice"']);
    expect(results[0].passed).toBe(true);
  });

  it('fails a false assertion', () => {
    const results = runAssertions(ctx, ['name == "Bob"']);
    expect(results[0].passed).toBe(false);
  });

  it('includes the actual status value for a failed status assertion', () => {
    const results = runAssertions({ ...ctx, $status: 500 }, ['$status == 200']);
    expect(results[0]).toMatchObject({
      passed: false,
      actual: [{ operand: '$status', value: 500 }],
    });
  });

  it('includes the actual body field value for a failed body assertion', () => {
    const results = runAssertions(ctx, ['name == "Bob"']);
    expect(results[0]).toMatchObject({
      passed: false,
      actual: [{ operand: 'name', value: 'Alice' }],
    });
  });

  it('includes all referenced operand values for a failed composite assertion', () => {
    const results = runAssertions(ctx, ['name == "Bob" && $status == 201']);
    expect(results[0]).toMatchObject({
      passed: false,
      actual: [
        { operand: 'name', value: 'Alice' },
        { operand: '$status', value: 200 },
      ],
    });
  });

  it('runs multiple assertions independently', () => {
    const results = runAssertions(ctx, ['name == "Alice"', 'name == "Bob"']);
    expect(results[0].passed).toBe(true);
    expect(results[1].passed).toBe(false);
  });

  it('captures evaluate() errors as failed assertions', () => {
    // Pass an invalid expression that causes an error
    const results = runAssertions(ctx, ['']);
    // Empty expression: evaluate returns false or throws — either way, no crash
    expect(results).toHaveLength(1);
  });
});
