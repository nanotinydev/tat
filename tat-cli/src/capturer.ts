import { query } from '@nanotiny/json-expression';

export function runCaptures(
  context: Record<string, unknown>,
  capture: Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [varName, path] of Object.entries(capture)) {
    try {
      const value = query(context, path);
      if (value !== undefined && value !== null) {
        result[varName] = String(value);
      }
    } catch (e) {
      console.warn(`  [warn] capture "${varName}" (path: "${path}") failed: ${(e as Error).message}`);
    }
  }

  return result;
}
