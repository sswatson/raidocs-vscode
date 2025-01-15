import * as vscode from "vscode";
import { insertReference } from "./reference.js";
import { insertImage } from "./image.js";
import {
  stopJupyterServer,
  restartKernel,
  runCodeAtCursor,
  openJupyterInBrowser,
} from "./jupyter.js";
import { registerOutputChannel } from "./utils.js";

export function activate(context: vscode.ExtensionContext) {
  registerOutputChannel(context);
  
  const runPythonCodeCommand = vscode.commands.registerCommand(
    "raidocs.runPythonCode",
    () => runCodeAtCursor("python")
  );

  const runSqlCodeCommand = vscode.commands.registerCommand(
    "raidocs.runSqlCode",
    () => runCodeAtCursor("sql")
  );

  const restartKernelCommand = vscode.commands.registerCommand(
    "raidocs.restartKernel",
    restartKernel
  );

  const openJupyterInBrowserCommand = vscode.commands.registerCommand(
    "raidocs.openJupyterInBrowser",
    openJupyterInBrowser
  );

  const stopServerCommand = vscode.commands.registerCommand(
    "raidocs.stopJupyterServer",
    async () => {
      await stopJupyterServer();
    }
  );

  const insertImageCommand = vscode.commands.registerCommand(
    "raidocs.insertImage",
    insertImage
  );

  const insertReferenceCommand = vscode.commands.registerCommand(
    "raidocs.insertReference",
    insertReference
  );

  context.subscriptions.push(
    runPythonCodeCommand,
    runSqlCodeCommand,
    restartKernelCommand,
    openJupyterInBrowserCommand,
    stopServerCommand,
    insertImageCommand,
    insertReferenceCommand
  );
}

export function deactivate() {
  stopJupyterServer();
}
