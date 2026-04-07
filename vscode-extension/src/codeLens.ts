import * as vscode from 'vscode';
import { parseTestFile, isTatFile } from './fileParser';

export class TatCodeLensProvider implements vscode.CodeLensProvider {
  private changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.changeEmitter.event;

  provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken,
  ): vscode.CodeLens[] {
    if (!isTatFile(document.fileName)) return [];

    let parsed;
    try {
      parsed = parseTestFile(document.getText(), document.fileName);
    } catch {
      return [];
    }

    const lenses: vscode.CodeLens[] = [];

    // File-level button — sits on the "suites" line
    lenses.push(
      new vscode.CodeLens(parsed.fileRange, {
        title: 'Run All ▶',
        command: 'tat.runFile',
        arguments: [document.uri],
      }),
    );

    for (const suite of parsed.suites) {
      lenses.push(
        new vscode.CodeLens(suite.range, {
          title: 'Run Suite ▶',
          command: 'tat.runSuite',
          arguments: [document.uri, suite.name],
        }),
      );

      for (const test of suite.tests) {
        lenses.push(
          new vscode.CodeLens(test.range, {
            title: 'Run Test ▶',
            command: 'tat.runTest',
            arguments: [document.uri, suite.name, test.name],
          }),
        );
      }
    }

    return lenses;
  }

  refresh(): void {
    this.changeEmitter.fire();
  }

  dispose(): void {
    this.changeEmitter.dispose();
  }
}
