import * as vscode from 'vscode';

let statusBarItem: vscode.StatusBarItem | null = null;
let outputChannel: vscode.OutputChannel | null = null;

export function registerOutputChannel(context: vscode.ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel("RelationalAI Docs");
    context.subscriptions.push(outputChannel);
}

export function updateStatusBar(message: string) {
  if (!statusBarItem) {
    statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left
    );
  }
  statusBarItem.text = message;
  statusBarItem.show();
}

export function hideStatusBar() {
  if (statusBarItem) {
    statusBarItem.hide();
  }
}

export function logMessage(message: string) {
  if (!outputChannel) {
    return;
  }
  outputChannel.appendLine(message);
  outputChannel.show(true); // Bring the output channel to the front if hidden
}

export function getVirtualEnvDirectory() {
  const config = vscode.workspace.getConfiguration("raidocs");
  const virtualEnvDirectory = config.get<string>("virtualEnvDirectory", ".venv");
  return virtualEnvDirectory ;
}