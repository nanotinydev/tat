import type { RunResult } from '@tat/shared';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';

export type {
  AssertionResult,
  TestResult,
  SuiteResult,
  RunResult,
} from '@tat/shared';

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
    status?: true;
    body?: true;
    headers?: true;
    header?: true;
  };
  skip?: boolean;
  timeout?: number;
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
