import * as vscode from 'vscode';
import { isTatFile, isYamlTatFile, parseTatFileContent } from '@tat/shared';

/** Check whether a file path ends with a recognised TAT extension. */
export { isTatFile };

export interface ParsedTest {
  name: string;
  range: vscode.Range;
}

export interface ParsedSuite {
  name: string;
  range: vscode.Range;
  tests: ParsedTest[];
}

export interface ParsedFile {
  suites: ParsedSuite[];
  fileRange: vscode.Range;
}

type TatFile = {
  suites?: Array<{
    name: string;
    tests?: Array<{ name: string }>;
  }>;
};

/**
 * Parse a .tat.json / .tat.yml / .tat.yaml file and return suite/test names
 * with their line positions. Uses JSON.parse or YAML.parse for structure +
 * line scanning for positions. No external deps beyond the yaml package.
 */
export function parseTestFile(text: string, fileName = '.tat.json'): ParsedFile {
  let data: TatFile;
  try {
    data = parseTatFileContent(fileName, text) as TatFile;
  } catch {
    const format = isYamlTatFile(fileName) ? 'YAML' : 'JSON';
    throw new Error(`${format} parse error in test file`);
  }

  const lines = text.split('\n');

  if (!Array.isArray(data?.suites)) return { suites: [], fileRange: lineRange(lines, 0) };

  // Find the line that contains the "suites" key for the file-level CodeLens anchor
  const suitesKeyLine = lines.findIndex(l => /"suites"\s*:/.test(l) || /^\s*suites\s*:/.test(l));
  const fileRange = lineRange(lines, suitesKeyLine >= 0 ? suitesKeyLine : 0);

  const yaml = isYamlTatFile(fileName);
  const suites: ParsedSuite[] = [];
  let cursor = 0;

  for (const suite of data.suites) {
    const suiteLine = findNameLine(lines, suite.name, cursor, yaml);
    const suiteRange = lineRange(lines, suiteLine);
    const tests: ParsedTest[] = [];
    let testCursor = suiteLine + 1;

    for (const test of suite.tests ?? []) {
      const testLine = findNameLine(lines, test.name, testCursor, yaml);
      tests.push({ name: test.name, range: lineRange(lines, testLine) });
      testCursor = testLine + 1;
    }

    suites.push({ name: suite.name, range: suiteRange, tests });
    cursor = testCursor;
  }

  return { suites, fileRange };
}

/**
 * Find the line index (0-based) of the first `name: "value"` match at or after startLine.
 * Handles both JSON (`"name": "value"`) and YAML (`name: value`, `name: "value"`, `name: 'value'`).
 */
function findNameLine(lines: string[], name: string, startLine: number, yaml: boolean): number {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = yaml
    ? new RegExp(`^\\s*(?:-\\s*)?name\\b\\s*:\\s*(?:"${escaped}"|'${escaped}'|${escaped})\\s*$`)
    : new RegExp(`"name"\\s*:\\s*"${escaped}"`);
  for (let i = startLine; i < lines.length; i++) {
    if (pattern.test(lines[i])) return i;
  }
  return startLine;
}

function lineRange(lines: string[], lineIndex: number): vscode.Range {
  const len = lines[lineIndex]?.length ?? 0;
  return new vscode.Range(lineIndex, 0, lineIndex, len);
}
