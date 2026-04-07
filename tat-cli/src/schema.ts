import { z } from 'zod';

const TestSchema = z.object({
  name: z.string(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']),
  url: z.string(),
  headers: z.record(z.string()).optional(),
  body: z.unknown().optional(),
  assert: z.array(z.string()).default([]),
  capture: z.record(z.string()).optional(),
  response: z.union([
    z.literal(true),
    z.object({
      body: z.literal(true).optional(),
      header: z.literal(true).optional(),
    }),
  ]).optional(),
  skip: z.boolean().optional(),
  timeout: z.number().int().positive().optional(),
});

const SuiteSchema = z.object({
  name: z.string(),
  tags: z.array(z.string()).optional(),
  tests: z.array(TestSchema),
  skip: z.boolean().optional(),
});

export const TatFileSchema = z.object({
  $schema: z.string().optional(),
  env: z.union([z.string(), z.record(z.string())]).optional(),
  setup: z.string().optional(),
  suites: z.array(SuiteSchema),
  timeout: z.number().int().positive().optional(),
});

export type TatFile = z.infer<typeof TatFileSchema>;
export type Suite = z.infer<typeof SuiteSchema>;
export type Test = z.infer<typeof TestSchema>;
