import * as vscode from 'vscode';
import { TatTestController } from './testController';
import { TatCodeLensProvider } from './codeLens';

let tatController: TatTestController | undefined;

export function activate(context: vscode.ExtensionContext): void {
  tatController = new TatTestController(context);

  const codeLensProvider = new TatCodeLensProvider();
  const selector: vscode.DocumentSelector = [
    { language: 'json', pattern: '**/*.tat.json' },
    { language: 'yaml', pattern: '**/*.tat.yml' },
    { language: 'yaml', pattern: '**/*.tat.yaml' },
  ];

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(selector, codeLensProvider),

    vscode.commands.registerCommand('tat.runFile', (uri: vscode.Uri) =>
      tatController?.runFileCommand(uri),
    ),
    vscode.commands.registerCommand('tat.runSuite', (uri: vscode.Uri, suiteName: string) =>
      tatController?.runSuiteCommand(uri, suiteName),
    ),
    vscode.commands.registerCommand('tat.runTest', (uri: vscode.Uri, suiteName: string, testName: string) =>
      tatController?.runTestCommand(uri, suiteName, testName),
    ),
    vscode.commands.registerCommand('tat.validateFile', (uri?: vscode.Uri) =>
      tatController?.validateFileCommand(uri),
    ),
  );
}

export function deactivate(): void {
  tatController?.dispose();
  tatController = undefined;
}
