import { evaluate, parseCondition, query } from '@nanotiny/json-expression';
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
      return {
        expr,
        passed,
        ...(!passed ? { actual: collectActualValues(context, expr) } : {}),
      };
    } catch (e) {
      return { expr, passed: false, error: (e as Error).message };
    }
  });
}

function collectActualValues(
  context: Record<string, unknown>,
  expr: string,
): Array<{ operand: string; value: unknown }> {
  try {
    const operands = new Set<string>();
    for (const condition of parseCondition(expr, '')) {
      addOperand(operands, condition.leftOperand);
      addOperand(operands, condition.rightOperand);
    }

    return [...operands].map(operand => ({
      operand,
      value: query(context, operand),
    }));
  } catch {
    return [];
  }
}

function addOperand(operands: Set<string>, operand: string): void {
  const trimmed = operand.trim();
  if (!trimmed || isLiteralOperand(trimmed)) return;
  operands.add(trimmed);
}

function isLiteralOperand(operand: string): boolean {
  if (/^(['"`]).*\1$/.test(operand)) return true;
  if (!Number.isNaN(Number(operand)) && operand.trim() !== '') return true;
  return operand.toLowerCase() === 'true' || operand.toLowerCase() === 'false';
}
