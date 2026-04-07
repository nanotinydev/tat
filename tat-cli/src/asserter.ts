import { evaluate } from '@nanotiny/json-expression';
import type { HttpResponse } from './http.js';
import type { AssertionResult } from './types.js';

export function buildContext(response: HttpResponse, durationMs?: number): Record<string, unknown> {
  const { status, headers, body } = response;
  const special: Record<string, unknown> = { $status: status, $headers: headers, $body: body };
  if (durationMs !== undefined) special['$duration'] = durationMs;

  if (body !== null && typeof body === 'object' && !Array.isArray(body)) {
    // Spread body fields at root for ergonomic access; $-prefixed fields take precedence
    return { ...(body as Record<string, unknown>), ...special };
  }

  return special;
}

export function runAssertions(
  context: Record<string, unknown>,
  assertions: string[],
): AssertionResult[] {
  return assertions.map(expr => {
    try {
      const passed = evaluate(context, expr);
      return { expr, passed };
    } catch (e) {
      return { expr, passed: false, error: (e as Error).message };
    }
  });
}
