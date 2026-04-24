import { z } from 'zod';

export const AssertionActualSchema = z.object({
  operand: z.string(),
  value: z.unknown(),
});

export const AssertionResultSchema = z.object({
  expr: z.string(),
  passed: z.boolean(),
  error: z.string().optional(),
  actual: z.array(AssertionActualSchema).optional(),
});

export const TestResultSchema = z.object({
  name: z.string(),
  passed: z.boolean(),
  skipped: z.boolean().optional(),
  assertions: z.array(AssertionResultSchema),
  durationMs: z.number(),
  error: z.string().optional(),
  captures: z.record(z.string()).optional(),
  responseStatus: z.number().optional(),
  responseBody: z.unknown().optional(),
  responseHeaders: z.record(z.string()).optional(),
});

export const SuiteResultSchema = z.object({
  name: z.string(),
  tags: z.array(z.string()),
  tests: z.array(TestResultSchema),
});

export const RunResultSchema = z.object({
  suites: z.array(SuiteResultSchema),
  total: z.number(),
  passed: z.number(),
  failed: z.number(),
  skipped: z.number(),
  durationMs: z.number(),
});

export type AssertionResult = z.infer<typeof AssertionResultSchema>;
export type TestResult = z.infer<typeof TestResultSchema>;
export type SuiteResult = z.infer<typeof SuiteResultSchema>;
export type RunResult = z.infer<typeof RunResultSchema>;
