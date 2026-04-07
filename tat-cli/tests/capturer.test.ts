import { describe, it, expect } from 'vitest';
import { runCaptures } from '../src/capturer.js';

describe('runCaptures', () => {
  const ctx: Record<string, unknown> = {
    $status: 201,
    $body: { id: 42, name: 'Alice' },
    id: 42,
    name: 'Alice',
  };

  it('captures a top-level property', () => {
    const result = runCaptures(ctx, { userId: 'id' });
    expect(result).toEqual({ userId: '42' });
  });

  it('captures multiple properties', () => {
    const result = runCaptures(ctx, { userId: 'id', userName: 'name' });
    expect(result).toEqual({ userId: '42', userName: 'Alice' });
  });

  it('returns empty object for empty capture map', () => {
    const result = runCaptures(ctx, {});
    expect(result).toEqual({});
  });

  it('does not throw on any query path', () => {
    // The library may return values for unexpected paths; capturer should never throw
    expect(() => runCaptures(ctx, { x: 'some.deep.path' })).not.toThrow();
  });

  it('stringifies captured values', () => {
    const result = runCaptures({ count: 5 }, { n: 'count' });
    expect(result).toEqual({ n: '5' });
  });
});
