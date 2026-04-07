import { describe, expect, it } from 'vitest';
import { collectRunTargets, type RunTreeNode } from '../src/runTargets';

function testNode(fileKey: string, suiteName: string, testName: string): RunTreeNode {
  return {
    id: `test::${fileKey}::${suiteName}::${testName}`,
    kind: 'test',
    fileKey,
    suiteName,
    testName,
    children: [],
  };
}

function suiteNode(fileKey: string, suiteName: string, tests: RunTreeNode[]): RunTreeNode {
  return {
    id: `suite::${fileKey}::${suiteName}`,
    kind: 'suite',
    fileKey,
    suiteName,
    children: tests,
  };
}

function fileNode(fileKey: string, suites: RunTreeNode[]): RunTreeNode {
  return {
    id: fileKey,
    kind: 'file',
    fileKey,
    children: suites,
  };
}

describe('collectRunTargets', () => {
  const fileKey = 'file:///workspace/sample.tat.json';
  const login = testNode(fileKey, 'Auth', 'Login');
  const logout = testNode(fileKey, 'Auth', 'Logout');
  const invoice = testNode(fileKey, 'Billing', 'Invoice');
  const refund = testNode(fileKey, 'Billing', 'Refund');
  const auth = suiteNode(fileKey, 'Auth', [login, logout]);
  const billing = suiteNode(fileKey, 'Billing', [invoice, refund]);
  const file = fileNode(fileKey, [auth, billing]);

  it('drops excluded tests from a file-level include before regrouping targets', () => {
    expect(collectRunTargets([file], [invoice])).toEqual([
      { fileKey, suiteName: 'Auth', testName: undefined },
      { fileKey, suiteName: 'Billing', testName: 'Refund' },
    ]);
  });

  it('keeps only the remaining tests when a suite-level include excludes one test', () => {
    expect(collectRunTargets([billing], [refund])).toEqual([
      { fileKey, suiteName: 'Billing', testName: 'Invoice' },
    ]);
  });

  it('removes an excluded suite from a file-level include', () => {
    expect(collectRunTargets([file], [billing])).toEqual([
      { fileKey, suiteName: 'Auth', testName: undefined },
    ]);
  });
});
