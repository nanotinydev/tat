import chalk from 'chalk';
import type { AssertionResult, RunResult, TestResult, MultiRunResult } from './types.js';

export type OutputFormat = 'console' | 'json' | 'junit';

function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
}

function summaryLine(result: RunResult): string {
  const parts = [`${result.passed} passed`];
  if (result.failed > 0) parts.push(`${result.failed} failed`);
  if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
  const str = `Results: ${parts.join(', ')}`;
  return result.failed === 0 ? chalk.green(str) : chalk.red(str);
}

function formatActualValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  const json = JSON.stringify(value);
  return json === undefined ? String(value) : json;
}

function formatActuals(assertion: AssertionResult): string {
  if (!assertion.actual || assertion.actual.length === 0) return '';
  const details = assertion.actual
    .map(({ operand, value }) => `${operand}=${formatActualValue(value)}`)
    .join(', ');
  return ` (actual: ${details})`;
}

function formatAssertionFailure(assertion: AssertionResult): string {
  const errDetail = assertion.error ? `: ${assertion.error}` : '';
  return `${assertion.expr}${formatActuals(assertion)}${errDetail}`;
}

function consoleReport(result: RunResult): string {
  const lines: string[] = [];

  for (const suite of result.suites) {
    const tags = suite.tags.length > 0 ? ` ${chalk.dim(`[${suite.tags.join(', ')}]`)}` : '';
    lines.push(`\n${chalk.bold(suite.name)}${tags}`);

    for (const test of suite.tests) {
      const duration = chalk.dim(`(${formatDuration(test.durationMs)})`);

      if (test.skipped) {
        lines.push(`  ${chalk.yellow('⊘')} ${test.name} ${chalk.dim('(skipped)')}`);
      } else if (test.error) {
        lines.push(`  ${chalk.red('✘')} ${test.name} ${duration}`);
        lines.push(`    ${chalk.red(test.error)}`);
      } else if (test.passed) {
        lines.push(`  ${chalk.green('✔')} ${test.name} ${duration}`);
      } else {
        lines.push(`  ${chalk.red('✘')} ${test.name} ${duration}`);
        for (const a of test.assertions) {
          if (!a.passed) {
            lines.push(`    ${chalk.red('✘')} ${chalk.dim(formatAssertionFailure(a))}`);
          }
        }
      }

      appendCaptureLines(test, lines);
      appendResponseLines(test, lines);
    }
  }

  lines.push('');
  lines.push(`${summaryLine(result)} ${chalk.dim(`(${formatDuration(result.durationMs)})`)}`);

  return lines.join('\n');
}

function jsonReport(result: RunResult): string {
  return JSON.stringify(result, null, 2);
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function junitReport(result: RunResult): string {
  const total = result.total;
  const failures = result.failed;
  const skipped = result.skipped;
  const time = (result.durationMs / 1000).toFixed(3);

  const suiteXml = result.suites
    .map(suite => {
      const sTotal = suite.tests.length;
      const sFailures = suite.tests.filter(t => !t.passed && !t.skipped).length;
      const sSkipped = suite.tests.filter(t => t.skipped).length;
      const sTime = (suite.tests.reduce((sum, t) => sum + t.durationMs, 0) / 1000).toFixed(3);

      const testsXml = suite.tests
        .map(test => {
          const tTime = (test.durationMs / 1000).toFixed(3);
          const name = escapeXml(test.name);

          if (test.skipped) {
            return `    <testcase name="${name}" time="${tTime}">\n      <skipped/>\n    </testcase>`;
          }

          if (test.passed) {
            return `    <testcase name="${name}" time="${tTime}"/>`;
          }

          const failureMsg = test.error
            ? escapeXml(test.error)
            : test.assertions
                .filter(a => !a.passed)
                .map(a => escapeXml(formatAssertionFailure(a)))
                .join(', ');

          const failureBody = test.error
            ? escapeXml(test.error)
            : test.assertions
                .filter(a => !a.passed)
                .map(a => escapeXml(formatAssertionFailure(a)))
                .join('\n');

          return `    <testcase name="${name}" time="${tTime}">\n      <failure message="${failureMsg}">${failureBody}</failure>\n    </testcase>`;
        })
        .join('\n');

      return `  <testsuite name="${escapeXml(suite.name)}" tests="${sTotal}" failures="${sFailures}" skipped="${sSkipped}" time="${sTime}">\n${testsXml}\n  </testsuite>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites tests="${total}" failures="${failures}" skipped="${skipped}" time="${time}">\n${suiteXml}\n</testsuites>`;
}

export function liveSuiteHeader(name: string, tags: string[]): string {
  const tagStr = tags.length > 0 ? ` ${chalk.dim(`[${tags.join(', ')}]`)}` : '';
  return `\n${chalk.bold(name)}${tagStr}\n`;
}

function appendCaptureLines(test: TestResult, lines: string[]): void {
  if (test.captures !== undefined && Object.keys(test.captures).length > 0) {
    lines.push(`    ${chalk.cyan('Captured:')}`);
    for (const [k, v] of Object.entries(test.captures)) {
      lines.push(`      ${chalk.dim(k + ':')} ${v}`);
    }
  }
}

function appendResponseLines(test: TestResult, lines: string[]): void {
  if (test.responseStatus !== undefined) {
    lines.push(`    ${chalk.cyan('Response status:')} ${test.responseStatus}`);
  }
  if (test.responseHeaders !== undefined) {
    lines.push(`    ${chalk.cyan('Response headers:')}`);
    for (const [k, v] of Object.entries(test.responseHeaders)) {
      lines.push(`      ${chalk.dim(k + ':')} ${v}`);
    }
  }
  if (test.responseBody !== undefined) {
    lines.push(`    ${chalk.cyan('Response body:')}`);
    const pretty = JSON.stringify(test.responseBody, null, 2)
      .split('\n')
      .map(l => `      ${l}`)
      .join('\n');
    lines.push(chalk.dim(pretty));
  }
}

export function liveTestResult(test: TestResult): string {
  const duration = chalk.dim(`(${formatDuration(test.durationMs)})`);
  const lines: string[] = [];

  if (test.skipped) {
    lines.push(`  ${chalk.yellow('⊘')} ${test.name} ${chalk.dim('(skipped)')}`);
  } else if (test.error) {
    lines.push(`  ${chalk.red('✘')} ${test.name} ${duration}`);
    lines.push(`    ${chalk.red(test.error)}`);
  } else if (test.passed) {
    lines.push(`  ${chalk.green('✔')} ${test.name} ${duration}`);
  } else {
    lines.push(`  ${chalk.red('✘')} ${test.name} ${duration}`);
    for (const a of test.assertions) {
      if (!a.passed) {
        lines.push(`    ${chalk.red('✘')} ${chalk.dim(formatAssertionFailure(a))}`);
      }
    }
  }

  appendCaptureLines(test, lines);
  appendResponseLines(test, lines);

  return lines.join('\n') + '\n';
}

export function liveSummary(result: RunResult): string {
  return `\n${summaryLine(result)} ${chalk.dim(`(${formatDuration(result.durationMs)})`)}`;
}

export function report(result: RunResult, format: OutputFormat): string {
  switch (format) {
    case 'json':
      return jsonReport(result);
    case 'junit':
      return junitReport(result);
    default:
      return consoleReport(result);
  }
}

// --- Multi-file report functions ---

function multiSummaryLine(result: MultiRunResult): string {
  const parts = [`${result.passed} passed`];
  if (result.failed > 0) parts.push(`${result.failed} failed`);
  if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
  const fileCount = `${result.files.length} file${result.files.length !== 1 ? 's' : ''}`;
  const str = `Results: ${parts.join(', ')} (${fileCount})`;
  return result.failed === 0 ? chalk.green(str) : chalk.red(str);
}

function multiConsoleReport(result: MultiRunResult): string {
  const lines: string[] = [];

  for (const fileResult of result.files) {
    lines.push(`\n${chalk.cyan.bold(fileResult.file)}`);
    lines.push(chalk.dim('─'.repeat(fileResult.file.length)));

    for (const suite of fileResult.result.suites) {
      const tags = suite.tags.length > 0 ? ` ${chalk.dim(`[${suite.tags.join(', ')}]`)}` : '';
      lines.push(`${chalk.bold(suite.name)}${tags}`);

      for (const test of suite.tests) {
        const duration = chalk.dim(`(${formatDuration(test.durationMs)})`);

        if (test.skipped) {
          lines.push(`  ${chalk.yellow('⊘')} ${test.name} ${chalk.dim('(skipped)')}`);
        } else if (test.error) {
          lines.push(`  ${chalk.red('✘')} ${test.name} ${duration}`);
          lines.push(`    ${chalk.red(test.error)}`);
        } else if (test.passed) {
          lines.push(`  ${chalk.green('✔')} ${test.name} ${duration}`);
        } else {
          lines.push(`  ${chalk.red('✘')} ${test.name} ${duration}`);
          for (const a of test.assertions) {
            if (!a.passed) {
              lines.push(`    ${chalk.red('✘')} ${chalk.dim(formatAssertionFailure(a))}`);
            }
          }
        }

        appendCaptureLines(test, lines);
        appendResponseLines(test, lines);
      }
    }
  }

  lines.push('');
  lines.push(`${multiSummaryLine(result)} ${chalk.dim(`(${formatDuration(result.durationMs)})`)}`);

  return lines.join('\n');
}

function multiJsonReport(result: MultiRunResult): string {
  return JSON.stringify(result, null, 2);
}

function multiJunitReport(result: MultiRunResult): string {
  const total = result.total;
  const failures = result.failed;
  const skipped = result.skipped;
  const time = (result.durationMs / 1000).toFixed(3);

  const suiteXml = result.files
    .flatMap(fileResult =>
      fileResult.result.suites.map(suite => {
        const suiteName = `${fileResult.file} / ${suite.name}`;
        const sTotal = suite.tests.length;
        const sFailures = suite.tests.filter(t => !t.passed && !t.skipped).length;
        const sSkipped = suite.tests.filter(t => t.skipped).length;
        const sTime = (suite.tests.reduce((sum, t) => sum + t.durationMs, 0) / 1000).toFixed(3);

        const testsXml = suite.tests
          .map(test => {
            const tTime = (test.durationMs / 1000).toFixed(3);
            const name = escapeXml(test.name);

            if (test.skipped) {
              return `    <testcase name="${name}" time="${tTime}">\n      <skipped/>\n    </testcase>`;
            }

            if (test.passed) {
              return `    <testcase name="${name}" time="${tTime}"/>`;
            }

            const failureMsg = test.error
              ? escapeXml(test.error)
              : test.assertions
                  .filter(a => !a.passed)
                  .map(a => escapeXml(formatAssertionFailure(a)))
                  .join(', ');

            const failureBody = test.error
              ? escapeXml(test.error)
              : test.assertions
                  .filter(a => !a.passed)
                  .map(a => escapeXml(formatAssertionFailure(a)))
                  .join('\n');

            return `    <testcase name="${name}" time="${tTime}">\n      <failure message="${failureMsg}">${failureBody}</failure>\n    </testcase>`;
          })
          .join('\n');

        return `  <testsuite name="${escapeXml(suiteName)}" tests="${sTotal}" failures="${sFailures}" skipped="${sSkipped}" time="${sTime}">\n${testsXml}\n  </testsuite>`;
      }),
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites tests="${total}" failures="${failures}" skipped="${skipped}" time="${time}">\n${suiteXml}\n</testsuites>`;
}

export function liveFileHeader(file: string): string {
  return `\n${chalk.cyan.bold(file)}\n${chalk.dim('─'.repeat(file.length))}\n`;
}

export function multiLiveSummary(result: MultiRunResult): string {
  return `\n${multiSummaryLine(result)} ${chalk.dim(`(${formatDuration(result.durationMs)})`)}`;
}

export function multiReport(result: MultiRunResult, format: OutputFormat): string {
  switch (format) {
    case 'json':
      return multiJsonReport(result);
    case 'junit':
      return multiJunitReport(result);
    default:
      return multiConsoleReport(result);
  }
}
