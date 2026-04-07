import * as vscode from 'vscode';
import * as path from 'path';
import { parseTestFile } from './fileParser';
import { startRunFile, validateFile, TatNotFoundError, TatRunCancelledError } from './tatRunner';
import { collectRunTargets, type RunTreeNode, type RunTargetSelection } from './runTargets';
import type { RunResult, TestResult } from './types';

interface RunTarget {
  fileUri: vscode.Uri;
  suiteFilter: string | undefined;
  testFilter: string | undefined;
  runItem: vscode.TestItem;
  testItems: vscode.TestItem[];
}

export class TatTestController {
  private controller: vscode.TestController;
  private outputChannel: vscode.OutputChannel;
  private fileWatcher: vscode.FileSystemWatcher;
  private fileItems = new Map<string, vscode.TestItem>();

  constructor(private context: vscode.ExtensionContext) {
    this.controller = vscode.tests.createTestController('tat', 'Tiny API Test');
    this.outputChannel = vscode.window.createOutputChannel('Tiny API Test');

    this.controller.createRunProfile(
      'Run',
      vscode.TestRunProfileKind.Run,
      (request, token) => this.handleRunRequest(request, token),
      true,
    );

    this.controller.resolveHandler = async (item) => {
      if (!item) {
        await this.discoverAllFiles();
      }
    };

    context.subscriptions.push(this.controller, this.outputChannel);

    const pattern = vscode.workspace
      .getConfiguration('tat')
      .get<string>('testFilePattern', '**/*.tat.{json,yml,yaml}');

    this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);
    this.fileWatcher.onDidCreate((uri) => this.loadFileTestItems(uri));
    this.fileWatcher.onDidChange((uri) => this.loadFileTestItems(uri));
    this.fileWatcher.onDidDelete((uri) => this.removeFileTestItems(uri));
    context.subscriptions.push(this.fileWatcher);

    void this.discoverAllFiles();
  }

  private async discoverAllFiles(): Promise<void> {
    const pattern = vscode.workspace
      .getConfiguration('tat')
      .get<string>('testFilePattern', '**/*.tat.{json,yml,yaml}');
    const uris = await vscode.workspace.findFiles(pattern, '**/node_modules/**');
    await Promise.all(uris.map((uri) => this.loadFileTestItems(uri)));
  }

  private async loadFileTestItems(uri: vscode.Uri): Promise<void> {
    const key = uri.toString();

    let fileItem = this.fileItems.get(key);
    if (!fileItem) {
      fileItem = this.controller.createTestItem(key, path.basename(uri.fsPath), uri);
      fileItem.canResolveChildren = true;
      this.controller.items.add(fileItem);
      this.fileItems.set(key, fileItem);
    }

    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      const { suites } = parseTestFile(doc.getText(), uri.fsPath);

      const suiteItems: vscode.TestItem[] = [];

      for (const suite of suites) {
        const suiteId = `suite::${key}::${suite.name}`;
        const suiteItem = this.controller.createTestItem(suiteId, suite.name, uri);
        suiteItem.range = suite.range;

        for (const test of suite.tests) {
          const testId = `test::${key}::${suite.name}::${test.name}`;
          const testItem = this.controller.createTestItem(testId, test.name, uri);
          testItem.range = test.range;
          suiteItem.children.add(testItem);
        }

        suiteItems.push(suiteItem);
      }

      fileItem.children.replace(suiteItems);
      fileItem.error = undefined;
    } catch (err) {
      fileItem.error = (err as Error).message;
      fileItem.children.replace([]);
    }
  }

  private removeFileTestItems(uri: vscode.Uri): void {
    const key = uri.toString();
    const item = this.fileItems.get(key);
    if (item) {
      this.controller.items.delete(key);
      this.fileItems.delete(key);
    }
  }

  private async handleRunRequest(
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken,
  ): Promise<void> {
    const run = this.controller.createTestRun(request);
    let cancelActiveRun: (() => void) | undefined;
    const cancellationSubscription = token.onCancellationRequested(() => {
      cancelActiveRun?.();
    });

    void vscode.commands.executeCommand('testing.showMostRecentOutput');

    const targets = this.collectRunTargets(request);
    const config = vscode.workspace.getConfiguration('tat');
    const cliPath = config.get<string>('cliPath', '');
    const timeout = config.get<number>('timeout', 30000);
    const workspaceFolders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);

    for (const target of targets) {
      if (token.isCancellationRequested) break;

      this.markTargetStarted(run, target);

      const label = path.basename(target.fileUri.fsPath);
      const suiteLabel = target.suiteFilter ? ` (suite: ${target.suiteFilter})` : '';
      this.outputChannel.appendLine(`\n--- Running: ${label}${suiteLabel} ---`);

      try {
        const activeRun = startRunFile(target.fileUri.fsPath, workspaceFolders, {
          suiteName: target.suiteFilter,
          testName: target.testFilter,
          cliPath,
          timeout,
        });
        cancelActiveRun = () => activeRun.cancel();
        const { result, rawOutput } = await activeRun.result;
        cancelActiveRun = undefined;

        this.outputChannel.append(rawOutput);

        run.appendOutput(`\r\n--- ${label}${suiteLabel} ---\r\n`);
        for (const suiteResult of result.suites) {
          run.appendOutput(`\r\n  Suite: ${suiteResult.name}\r\n`);
          for (const testResult of suiteResult.tests) {
            const icon = testResult.skipped ? '⊘' : testResult.passed ? '✓' : '✗';
            run.appendOutput(`    ${icon} ${testResult.name}`);
            if (!testResult.skipped && testResult.durationMs != null) {
              run.appendOutput(` (${testResult.durationMs}ms)`);
            }
            run.appendOutput('\r\n');
            if (!testResult.passed && !testResult.skipped) {
              if (testResult.error) {
                run.appendOutput(`        Error: ${testResult.error}\r\n`);
              }
              for (const assertion of testResult.assertions) {
                if (!assertion.passed) {
                  run.appendOutput(
                    `        ✗ ${assertion.expr}${assertion.error ? ': ' + assertion.error : ''}\r\n`,
                  );
                }
              }
            }
            if (testResult.responseHeaders) {
              run.appendOutput('        Response Headers:\r\n');
              for (const [header, value] of Object.entries(testResult.responseHeaders)) {
                run.appendOutput(`          ${header}: ${value}\r\n`);
              }
            }
            if (testResult.responseBody !== undefined) {
              const bodyText = typeof testResult.responseBody === 'string'
                ? testResult.responseBody
                : JSON.stringify(testResult.responseBody, null, 2);
              run.appendOutput('        Response Body:\r\n');
              for (const line of bodyText.split('\n')) {
                run.appendOutput(`          ${line}\r\n`);
              }
            }
          }
        }
        run.appendOutput(
          `\r\n  Total: ${result.passed} passed, ${result.failed} failed, ${result.skipped} skipped (${result.durationMs}ms)\r\n`,
        );

        this.applyRunResult(run, result, target.fileUri, target.testFilter);

        if (!target.suiteFilter) {
          const fileItem = this.fileItems.get(target.fileUri.toString());
          if (fileItem) {
            if (result.failed > 0) {
              run.failed(fileItem, new vscode.TestMessage(`${result.failed} test(s) failed`));
            } else {
              run.passed(fileItem);
            }
          }
        }
      } catch (err) {
        cancelActiveRun = undefined;

        if (err instanceof TatRunCancelledError) {
          this.outputChannel.appendLine('Run cancelled.');
          run.appendOutput('\r\nRun cancelled.\r\n');
          this.markTargetCancelled(run, target);
          break;
        }

        const message = (err as Error).message;
        this.outputChannel.appendLine(`ERROR: ${message}`);
        run.appendOutput(`\r\nERROR: ${message}\r\n`);

        if (err instanceof TatNotFoundError) {
          void vscode.window
            .showErrorMessage(message, 'Open Settings')
            .then((choice) => {
              if (choice === 'Open Settings') {
                void vscode.commands.executeCommand(
                  'workbench.action.openSettings',
                  'tat.cliPath',
                );
              }
            });
        }

        run.errored(target.runItem, new vscode.TestMessage(message));
      }
    }

    cancellationSubscription.dispose();
    run.end();
  }

  private applyRunResult(
    run: vscode.TestRun,
    result: RunResult,
    fileUri: vscode.Uri,
    testFilter?: string,
  ): void {
    const key = fileUri.toString();
    const fileItem = this.fileItems.get(key);

    for (const suiteResult of result.suites) {
      const suiteId = `suite::${key}::${suiteResult.name}`;
      const suiteItem = fileItem?.children.get(suiteId);

      for (const testResult of suiteResult.tests) {
        const testId = `test::${key}::${suiteResult.name}::${testResult.name}`;
        const testItem = suiteItem?.children.get(testId);
        if (!testItem) continue;

        this.applyTestResult(run, testItem, testResult);
      }

      if (suiteItem && !testFilter) {
        const allOk = suiteResult.tests.every((test) => test.passed || test.skipped);
        if (allOk) {
          run.passed(suiteItem);
        } else {
          const failCount = suiteResult.tests.filter((test) => !test.passed && !test.skipped).length;
          run.failed(suiteItem, new vscode.TestMessage(`${failCount} test(s) failed`));
        }
      }
    }
  }

  private applyTestResult(
    run: vscode.TestRun,
    item: vscode.TestItem,
    testResult: TestResult,
  ): void {
    if (testResult.skipped) {
      run.skipped(item);
      return;
    }

    if (testResult.passed) {
      run.passed(item, testResult.durationMs);
      return;
    }

    const messages: vscode.TestMessage[] = [];

    if (testResult.error) {
      messages.push(new vscode.TestMessage(testResult.error));
    } else {
      for (const assertion of testResult.assertions) {
        if (!assertion.passed) {
          const text = assertion.error
            ? `Assertion failed: ${assertion.expr}\n${assertion.error}`
            : `Assertion failed: ${assertion.expr}`;
          const message = new vscode.TestMessage(text);
          if (item.uri && item.range) {
            message.location = new vscode.Location(item.uri, item.range);
          }
          messages.push(message);
        }
      }
    }

    run.failed(
      item,
      messages.length > 0 ? messages : [new vscode.TestMessage('Test failed')],
      testResult.durationMs,
    );
  }

  private collectRunTargets(request: vscode.TestRunRequest): RunTarget[] {
    const includeItems = request.include ? request.include : this.getAllItems();
    const excludeItems = request.exclude ?? [];

    return collectRunTargets(
      includeItems.map((item) => this.toRunTreeNode(item)),
      excludeItems.map((item) => this.toRunTreeNode(item)),
    )
      .map((target) => this.materializeRunTarget(target))
      .filter((target): target is RunTarget => target !== undefined);
  }

  private getAllItems(): vscode.TestItem[] {
    const items: vscode.TestItem[] = [];
    this.controller.items.forEach((item) => items.push(item));
    return items;
  }

  private toRunTreeNode(item: vscode.TestItem): RunTreeNode {
    const parsed = this.parseItemId(item.id);
    const children: RunTreeNode[] = [];
    item.children.forEach((child) => {
      children.push(this.toRunTreeNode(child));
    });

    return {
      id: item.id,
      kind: parsed.testName ? 'test' : parsed.suiteName ? 'suite' : 'file',
      fileKey: parsed.fileKey ?? item.id,
      suiteName: parsed.suiteName,
      testName: parsed.testName,
      children,
    };
  }

  private materializeRunTarget(target: RunTargetSelection): RunTarget | undefined {
    const fileItem = this.fileItems.get(target.fileKey);
    if (!fileItem?.uri) return undefined;

    if (!target.suiteName) {
      return {
        fileUri: fileItem.uri,
        suiteFilter: undefined,
        testFilter: undefined,
        runItem: fileItem,
        testItems: this.getLeafTestItems(fileItem),
      };
    }

    const suiteId = `suite::${target.fileKey}::${target.suiteName}`;
    const suiteItem = fileItem.children.get(suiteId);
    if (!suiteItem) return undefined;

    if (!target.testName) {
      return {
        fileUri: fileItem.uri,
        suiteFilter: target.suiteName,
        testFilter: undefined,
        runItem: suiteItem,
        testItems: this.getLeafTestItems(suiteItem),
      };
    }

    const testId = `test::${target.fileKey}::${target.suiteName}::${target.testName}`;
    const testItem = suiteItem.children.get(testId);
    if (!testItem) return undefined;

    return {
      fileUri: fileItem.uri,
      suiteFilter: target.suiteName,
      testFilter: target.testName,
      runItem: testItem,
      testItems: [testItem],
    };
  }

  private getLeafTestItems(item: vscode.TestItem): vscode.TestItem[] {
    const parsed = this.parseItemId(item.id);
    if (parsed.testName) {
      return [item];
    }

    const result: vscode.TestItem[] = [];
    item.children.forEach((child) => {
      result.push(...this.getLeafTestItems(child));
    });
    return result;
  }

  private markTargetStarted(run: vscode.TestRun, target: RunTarget): void {
    run.started(target.runItem);

    if (!target.suiteFilter) {
      const fileItem = this.fileItems.get(target.fileUri.toString());
      fileItem?.children.forEach((suiteItem) => {
        run.started(suiteItem);
        suiteItem.children.forEach((testItem) => run.started(testItem));
      });
      return;
    }

    for (const item of target.testItems) {
      if (item.id !== target.runItem.id) {
        run.started(item);
      }
    }
  }

  private markTargetCancelled(run: vscode.TestRun, target: RunTarget): void {
    run.skipped(target.runItem);

    if (!target.suiteFilter) {
      const fileItem = this.fileItems.get(target.fileUri.toString());
      fileItem?.children.forEach((suiteItem) => {
        run.skipped(suiteItem);
        suiteItem.children.forEach((testItem) => run.skipped(testItem));
      });
      return;
    }

    for (const item of target.testItems) {
      if (item.id !== target.runItem.id) {
        run.skipped(item);
      }
    }
  }

  private parseItemId(id: string): {
    fileKey: string | undefined;
    suiteName: string | undefined;
    testName: string | undefined;
  } {
    if (id.startsWith('suite::')) {
      const rest = id.slice('suite::'.length);
      const separator = rest.indexOf('::');
      if (separator === -1) {
        return { fileKey: undefined, suiteName: undefined, testName: undefined };
      }
      return {
        fileKey: rest.slice(0, separator),
        suiteName: rest.slice(separator + 2),
        testName: undefined,
      };
    }

    if (id.startsWith('test::')) {
      const rest = id.slice('test::'.length);
      const firstSeparator = rest.indexOf('::');
      if (firstSeparator === -1) {
        return { fileKey: undefined, suiteName: undefined, testName: undefined };
      }
      const fileKey = rest.slice(0, firstSeparator);
      const remainder = rest.slice(firstSeparator + 2);
      const secondSeparator = remainder.indexOf('::');
      if (secondSeparator === -1) {
        return { fileKey, suiteName: remainder, testName: undefined };
      }
      return {
        fileKey,
        suiteName: remainder.slice(0, secondSeparator),
        testName: remainder.slice(secondSeparator + 2),
      };
    }

    return { fileKey: id, suiteName: undefined, testName: undefined };
  }

  async runFileCommand(uri: vscode.Uri): Promise<void> {
    const item = this.fileItems.get(uri.toString());
    if (!item) return;
    const request = new vscode.TestRunRequest([item]);
    await this.handleRunRequest(request, new vscode.CancellationTokenSource().token);
  }

  async runSuiteCommand(uri: vscode.Uri, suiteName: string): Promise<void> {
    const fileItem = this.fileItems.get(uri.toString());
    const suiteItem = fileItem?.children.get(`suite::${uri.toString()}::${suiteName}`);
    if (!suiteItem) return;
    const request = new vscode.TestRunRequest([suiteItem]);
    await this.handleRunRequest(request, new vscode.CancellationTokenSource().token);
  }

  async runTestCommand(uri: vscode.Uri, suiteName: string, testName: string): Promise<void> {
    const fileItem = this.fileItems.get(uri.toString());
    const suiteItem = fileItem?.children.get(`suite::${uri.toString()}::${suiteName}`);
    const testItem = suiteItem?.children.get(`test::${uri.toString()}::${suiteName}::${testName}`);
    if (!testItem) return;
    const request = new vscode.TestRunRequest([testItem]);
    await this.handleRunRequest(request, new vscode.CancellationTokenSource().token);
  }

  async validateFileCommand(uri?: vscode.Uri): Promise<void> {
    const target = uri ?? vscode.window.activeTextEditor?.document.uri;
    if (!target) return;

    const config = vscode.workspace.getConfiguration('tat');
    const workspaceFolders = (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath);

    this.outputChannel.show(true);
    this.outputChannel.appendLine(`\n--- Validate: ${path.basename(target.fsPath)} ---`);

    try {
      const { valid, message } = await validateFile(target.fsPath, workspaceFolders, {
        cliPath: config.get<string>('cliPath', ''),
      });
      this.outputChannel.appendLine(message);
      if (valid) {
        void vscode.window.showInformationMessage(message);
      } else {
        void vscode.window.showErrorMessage(message);
      }
    } catch (err) {
      const message = (err as Error).message;
      this.outputChannel.appendLine(`ERROR: ${message}`);
      void vscode.window.showErrorMessage(message);
    }
  }

  dispose(): void {
    this.fileWatcher.dispose();
  }
}
