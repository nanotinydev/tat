import { describe, it, expect } from 'vitest';
import { isTatFile, parseFileContent, TAT_EXTENSIONS } from '../src/fileFormat.js';

describe('TAT_EXTENSIONS', () => {
  it('contains all three extensions', () => {
    expect(TAT_EXTENSIONS).toContain('.tat.json');
    expect(TAT_EXTENSIONS).toContain('.tat.yml');
    expect(TAT_EXTENSIONS).toContain('.tat.yaml');
  });
});

describe('isTatFile', () => {
  it('accepts .tat.json', () => {
    expect(isTatFile('tests/api.tat.json')).toBe(true);
  });

  it('accepts .tat.yml', () => {
    expect(isTatFile('tests/api.tat.yml')).toBe(true);
  });

  it('accepts .tat.yaml', () => {
    expect(isTatFile('tests/api.tat.yaml')).toBe(true);
  });

  it('rejects plain .json', () => {
    expect(isTatFile('config.json')).toBe(false);
  });

  it('rejects plain .yml', () => {
    expect(isTatFile('config.yml')).toBe(false);
  });

  it('rejects unrelated files', () => {
    expect(isTatFile('readme.md')).toBe(false);
  });
});

describe('parseFileContent', () => {
  const validJson = JSON.stringify({ suites: [] });
  const validYaml = 'suites: []\n';

  it('parses JSON for .tat.json files', () => {
    const result = parseFileContent('test.tat.json', validJson);
    expect(result).toEqual({ suites: [] });
  });

  it('parses YAML for .tat.yml files', () => {
    const result = parseFileContent('test.tat.yml', validYaml);
    expect(result).toEqual({ suites: [] });
  });

  it('parses YAML for .tat.yaml files', () => {
    const result = parseFileContent('test.tat.yaml', validYaml);
    expect(result).toEqual({ suites: [] });
  });

  it('parses complex YAML correctly', () => {
    const yaml = `
suites:
  - name: My Suite
    tests:
      - name: Get users
        method: GET
        url: https://example.com/users
        assert:
          - "$status == 200"
`;
    const result = parseFileContent('test.tat.yml', yaml) as any;
    expect(result.suites).toHaveLength(1);
    expect(result.suites[0].name).toBe('My Suite');
    expect(result.suites[0].tests[0].method).toBe('GET');
  });

  it('throws on invalid JSON', () => {
    expect(() => parseFileContent('test.tat.json', '{bad')).toThrow('Invalid JSON');
  });

  it('throws on invalid YAML', () => {
    expect(() => parseFileContent('test.tat.yml', ':\n  :\n  - :\n  - {')).toThrow('Invalid YAML');
  });

  it('throws on unsupported extension', () => {
    expect(() => parseFileContent('test.txt', 'hello')).toThrow('Unsupported file format');
  });
});
