import type { Suite } from './types.js';

export interface MissingVariable {
  suiteName: string;
  testName: string;
  variable: string;
  sourceTestName?: string;
}

export function extractVarRefs(value: unknown): string[] {
  const refs: string[] = [];

  function scan(v: unknown): void {
    if (typeof v === 'string') {
      const pattern = /\{\{(\w+)\}\}/g;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(v)) !== null) {
        refs.push(match[1]);
      }
      return;
    }

    if (Array.isArray(v)) {
      v.forEach(scan);
      return;
    }

    if (v !== null && typeof v === 'object') {
      Object.values(v as Record<string, unknown>).forEach(scan);
    }
  }

  scan(value);
  return refs;
}

export function findMissingVariablesForSelectedTests(
  suites: Suite[],
  env: Record<string, string>,
  testName: string,
  manualVariables: Record<string, string> = {},
): MissingVariable[] {
  const selectedKnown = new Set([
    ...Object.keys(env),
    ...Object.keys(manualVariables),
  ]);
  const precedingCaptureOrigins = new Map<string, string>();
  const missing: MissingVariable[] = [];

  for (const suite of suites) {
    const suiteSkipped = suite.skip === true;

    for (const test of suite.tests) {
      const isSelectedTest = test.name === testName;
      const testSkipped = suiteSkipped || test.skip === true;

      if (isSelectedTest && !testSkipped) {
        const refs = new Set([
          ...extractVarRefs(test.url),
          ...extractVarRefs(test.headers),
          ...extractVarRefs(test.body),
        ]);

        for (const ref of refs) {
          if (selectedKnown.has(ref)) continue;
          missing.push({
            suiteName: suite.name,
            testName: test.name,
            variable: ref,
            sourceTestName: precedingCaptureOrigins.get(ref),
          });
        }

        if (test.capture) {
          for (const key of Object.keys(test.capture)) {
            selectedKnown.add(key);
          }
        }
      }

      if (!testSkipped && test.capture) {
        for (const key of Object.keys(test.capture)) {
          precedingCaptureOrigins.set(key, test.name);
        }
      }
    }
  }

  return missing;
}

export function formatMissingVariablesError(missing: MissingVariable[]): string {
  const lines = missing.map((entry) => {
    const variableRef = `{{${entry.variable}}}`;
    if (entry.sourceTestName) {
      return `Selected test "${entry.testName}" in suite "${entry.suiteName}" requires "${variableRef}", which is normally captured by earlier test "${entry.sourceTestName}".`;
    }

    return `Selected test "${entry.testName}" in suite "${entry.suiteName}" requires "${variableRef}", but it is not defined in env or supplied via --variables.`;
  });

  const suggestions = missing.map((entry) => `--variables ${entry.variable}=<value>`).join(' ');
  lines.push(`Run the suite instead, or pass ${suggestions}.`);
  return lines.join('\n');
}
