import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  Range: class Range {
    constructor(
      public startLineNumber: number,
      public startColumn: number,
      public endLineNumber: number,
      public endColumn: number,
    ) {}
  },
}));

describe('parseTestFile', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('includes the underlying parse failure details for invalid JSON', async () => {
    const { parseTestFile } = await import('../src/fileParser');

    expect(() => parseTestFile('{', 'broken.tat.json')).toThrow(/Invalid JSON in broken\.tat\.json:/);
  });

  it('preserves unsupported-format errors from the shared parser', async () => {
    const { parseTestFile } = await import('../src/fileParser');

    expect(() => parseTestFile('{}', 'broken.json')).toThrow('Unsupported file format: broken.json');
  });
});
