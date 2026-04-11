import { readFile } from 'fs/promises';
import * as path from 'path';
import { parse as parseYaml } from 'yaml';

interface PromptTest {
  name: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  capture?: Record<string, string>;
  skip?: boolean;
}

interface PromptSuite {
  name: string;
  skip?: boolean;
  tests: PromptTest[];
}

interface PromptTatFile {
  env?: string | Record<string, string>;
  setup?: string;
  suites: PromptSuite[];
}

export interface PromptVariable {
  variable: string;
  sourceTestName: string;
}

function isYamlFile(fileName: string): boolean {
  return fileName.endsWith('.tat.yml') || fileName.endsWith('.tat.yaml');
}

function parseTatFile(text: string, filePath: string): PromptTatFile {
  try {
    const parsed = isYamlFile(filePath)
      ? parseYaml(text)
      : JSON.parse(text);

    return parsed as PromptTatFile;
  } catch (error) {
    const format = isYamlFile(filePath) ? 'YAML' : 'JSON';
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${format} parse error in test file ${filePath}: ${message}`);
  }
}

async function resolveEnv(
  env: string | Record<string, string> | undefined,
  filePath: string,
): Promise<Record<string, string>> {
  if (!env) return {};
  if (typeof env === 'object') return env;

  const envPath = path.resolve(path.dirname(filePath), env);
  let raw: string;
  try {
    raw = await readFile(envPath, 'utf-8');
  } catch {
    throw new Error(`Cannot read env file: ${envPath}`);
  }

  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON in env file ${envPath}: ${message}`);
  }
}

function extractVarRefs(value: unknown): string[] {
  const refs: string[] = [];

  function scan(v: unknown): void {
    if (typeof v === 'string') {
      const pattern = /\{\{(\w+)\}\}/g;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(v)) !== null) refs.push(match[1]);
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

export async function findPromptVariables(
  filePath: string,
  suiteName: string | undefined,
  testName: string | undefined,
): Promise<PromptVariable[] | null> {
  if (!suiteName || !testName) {
    return [];
  }

  const raw = await readFile(filePath, 'utf-8');
  const tatFile = parseTatFile(raw, filePath);

  if (tatFile.setup) {
    return null;
  }

  const env = await resolveEnv(tatFile.env, filePath);
  const suites = tatFile.suites.filter((suite) => suite.name === suiteName);
  const known = new Set(Object.keys(env));
  const captureOrigins = new Map<string, string>();
  const missing: PromptVariable[] = [];

  for (const suite of suites) {
    const suiteSkipped = suite.skip === true;

    for (const test of suite.tests) {
      const testSkipped = suiteSkipped || test.skip === true;
      const isSelectedTest = test.name === testName;

      if (isSelectedTest && !testSkipped) {
        const refs = new Set([
          ...extractVarRefs(test.url),
          ...extractVarRefs(test.headers),
          ...extractVarRefs(test.body),
        ]);

        for (const ref of refs) {
          const sourceTestName = captureOrigins.get(ref);
          if (!known.has(ref) && sourceTestName) {
            missing.push({ variable: ref, sourceTestName });
          }
        }
      }

      if (!testSkipped && test.capture) {
        for (const key of Object.keys(test.capture)) {
          known.add(key);
          captureOrigins.set(key, test.name);
        }
      }
    }
  }

  return missing;
}
