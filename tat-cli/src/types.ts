export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';

export interface Suite {
  name: string;
  tags?: string[];
  tests: Test[];
  skip?: boolean;
}

export interface Test {
  name: string;
  method: HttpMethod;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  assert: string[];
  capture?: Record<string, string>;
  response?: true | {
    body?: true;
    header?: true;
  };
  skip?: boolean;
  timeout?: number;
}

export interface AssertionResult {
  expr: string;
  passed: boolean;
  error?: string;
}

export interface TestResult {
  name: string;
  passed: boolean;
  skipped?: boolean;
  assertions: AssertionResult[];
  durationMs: number;
  error?: string;
  captures?: Record<string, string>;
  responseBody?: unknown;
  responseHeaders?: Record<string, string>;
}

export interface SuiteResult {
  name: string;
  tags: string[];
  tests: TestResult[];
}

export interface RunResult {
  suites: SuiteResult[];
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
}

export interface FileRunResult {
  file: string;
  result: RunResult;
}

export interface MultiRunResult {
  files: FileRunResult[];
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
}
