import { describe, it, expect } from 'vitest';
import { interpolate, interpolateDeep } from '../src/interpolate.js';

describe('interpolate', () => {
  it('replaces a single variable', () => {
    expect(interpolate('{{baseUrl}}/users', { baseUrl: 'https://api.example.com' }))
      .toBe('https://api.example.com/users');
  });

  it('replaces multiple variables', () => {
    expect(interpolate('{{host}}/{{path}}', { host: 'https://example.com', path: 'api' }))
      .toBe('https://example.com/api');
  });

  it('leaves unknown variables unchanged', () => {
    expect(interpolate('{{unknown}}', {})).toBe('{{unknown}}');
  });

  it('handles string with no variables', () => {
    expect(interpolate('no variables here', { x: '1' })).toBe('no variables here');
  });
});

describe('interpolateDeep', () => {
  it('interpolates strings inside an object', () => {
    const result = interpolateDeep(
      { url: '{{base}}/users', method: 'GET' },
      { base: 'https://api.example.com' },
    );
    expect(result).toEqual({ url: 'https://api.example.com/users', method: 'GET' });
  });

  it('interpolates strings inside nested objects', () => {
    const result = interpolateDeep(
      { headers: { Authorization: 'Bearer {{token}}' } },
      { token: 'abc123' },
    );
    expect(result).toEqual({ headers: { Authorization: 'Bearer abc123' } });
  });

  it('interpolates strings inside arrays', () => {
    const result = interpolateDeep(['{{a}}', '{{b}}'], { a: 'hello', b: 'world' });
    expect(result).toEqual(['hello', 'world']);
  });

  it('passes through non-string values', () => {
    const result = interpolateDeep({ count: 42, active: true }, {});
    expect(result).toEqual({ count: 42, active: true });
  });
});
