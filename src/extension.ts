import { spawn } from "child_process";
import { ServerConnection, KernelManager, Kernel } from "@jupyterlab/services";
import * as path from "path";
import * as vscode from "vscode";

let kernel: Kernel.IKernelConnection | null = null;
let jupyterProcess: ReturnType<typeof spawn> | null = null;
let statusBarItem: vscode.StatusBarItem | null = null;

function updateStatusBar(message: string) {
  if (!statusBarItem) {
    statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left
    );
  }
  statusBarItem.text = message;
  statusBarItem.show();
}

function hideStatusBar() {
  if (statusBarItem) {
    statusBarItem.hide();
  }
}

async function startJupyterServer(): Promise<string> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceFolder) {
    throw new Error("No workspace folder found.");
  }

  // Path to the jupyter executable in the virtual environment
  const jupyterPath = path.join(workspaceFolder, ".venv", "bin", "jupyter");

  return new Promise((resolve, reject) => {
    const jupyter = spawn(
      jupyterPath,
      [
        "notebook",
        "--no-browser",
        "--NotebookApp.token=",
        "--NotebookApp.disable_check_xsrf=True",
      ],
      {
        stdio: "pipe", // Capture output for parsing
      }
    );

    jupyterProcess = jupyter;

    let serverUrl = "";
    jupyter.stderr?.on("data", (data) => {
      const output = data.toString();
      const urlMatch = output.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (urlMatch) {
        serverUrl = urlMatch[0];
        resolve(serverUrl);
      }
    });

    jupyter.on("error", (err) => {
      reject(`Failed to start Jupyter server: ${err.message}`);
    });

    jupyter.on("close", (code) => {
      if (code !== 0 && !serverUrl) {
        reject(`Jupyter server exited with code ${code}`);
      }
    });
  });
}

export function activate(context: vscode.ExtensionContext) {
  const runPythonCodeCommand = vscode.commands.registerCommand(
    "raidocs.runPythonCodeBlock",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor.");
        return;
      }

      const document = editor.document;
      const cursorPosition = editor.selection.active;
      const text = document.getText();

      const fencedCodeRegex = /```python\n([\s\S]*?)```/g;
      let match: RegExpExecArray | null;

      while ((match = fencedCodeRegex.exec(text)) !== null) {
        const start = document.positionAt(match.index);
        const end = document.positionAt(match.index + match[0].length);

        if (
          cursorPosition.isAfterOrEqual(start) &&
          cursorPosition.isBeforeOrEqual(end)
        ) {
          const pythonCode = match[1];
          const blockRange = new vscode.Range(start, end);

          try {
            updateStatusBar("Running Python code...");

            if (!kernel) {
              await startKernel();
            }

            const output = await executePythonCode(pythonCode);

            const result =
              typeof output === "object" ? formatAsPyTable(output) : output;

            editor.edit((editBuilder) => {
              editBuilder.insert(blockRange.end, `\n\n${result}`);
            });

            hideStatusBar();
          } catch (error) {
            vscode.window.showErrorMessage(
              `Error executing Python code: ${error}`
            );
          }
          break;
        }
      }
    }
  );

  const restartKernelCommand = vscode.commands.registerCommand(
    "raidocs.restartKernel",
    async () => {
      try {
        if (kernel) {
          await kernel.shutdown();
        }
        await startKernel();
        vscode.window.showInformationMessage(
          "Jupyter kernel restarted successfully."
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Error restarting kernel: ${error}`);
      }
    }
  );

  const stopServerCommand = vscode.commands.registerCommand(
    "raidocs.stopJupyterServer",
    async () => {
      await stopJupyterServer();
    }
  );

  const insertImageCommand = vscode.commands.registerCommand(
    "raidocs.insertImage",
    async () => {
      const folders = vscode.workspace.workspaceFolders;
      if (!folders || !folders.length) {
        vscode.window.showInformationMessage("no folder open");
        return;
      }
      const imgDir = path.join(folders[0].uri.fsPath, "public/img");
      const selectedUris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        openLabel: "Select Image",
        filters: {
          Images: ["png", "jpg", "jpeg", "svg", "webp"],
        },
      });
      if (selectedUris) {
        const imgPath = selectedUris[0].toString();
        const imgName = imgPath.split("/").pop();
        if (imgName) {
          vscode.workspace.fs.copy(
            selectedUris[0],
            vscode.Uri.joinPath(vscode.Uri.file(imgDir), imgName)
          );
          if (vscode?.window?.activeTextEditor) {
            const img = `[${imgName.replace(/\.[a-z]*$/, "")}](img/${imgName})`;
            vscode.window.activeTextEditor.edit((edit) => {
              if (vscode?.window?.activeTextEditor) {
                edit.insert(
                  vscode.window.activeTextEditor.selection.active,
                  img
                );
              }
            });
          }
        }
      }
    }
  );

  context.subscriptions.push(
    runPythonCodeCommand,
    restartKernelCommand,
    stopServerCommand,
    insertImageCommand
  );
}

/**
 * Start a Jupyter kernel if one is not already running.
 */
async function startKernel() {
  if (!jupyterProcess) {
    vscode.window.showInformationMessage("Starting Jupyter server...");
    const serverUrl = await startJupyterServer();
    vscode.window.showInformationMessage(
      `Jupyter server started at ${serverUrl}`
    );
  }

  const settings = ServerConnection.makeSettings({
    baseUrl: "http://127.0.0.1:8888/", // Adjust port dynamically if needed
    token: "", // Empty since we disabled authentication
  });

  const kernelManager = new KernelManager({ serverSettings: settings });
  kernel = await kernelManager.startNew();
  console.log(`Kernel started: ${kernel?.id}`);
}

function wrapCodeForJsonOutput(code: string): string {
  // Split the code into lines and find the last non-comment line
  const lines = code.trim().split("\n");
  let lastCodeLineIndex = lines.length - 1;

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line && !line.startsWith("#")) {
      lastCodeLineIndex = i;
      break;
    }
  }

  // Wrap the code, assigning the last line to raidocs_result
  const wrappedCode = `
import pandas as pd
import json

# User code
${lines.slice(0, lastCodeLineIndex + 1).join("\n")}

# Assign the last expression to raidocs_result
raidocs_result = ${lines[lastCodeLineIndex]}

# Output JSON if raidocs_result is a DataFrame
if isinstance(raidocs_result, pd.DataFrame):
    raidocs_final_result = raidocs_result.to_json(orient="split")
else:
    raidocs_final_result = raidocs_result

raidocs_final_result
`.trim();

  return wrappedCode;
}

async function executePythonCode(code: string): Promise<any> {
  if (!kernel) {
    throw new Error("Kernel is not running.");
  }

  const wrappedCode = wrapCodeForJsonOutput(code);

  const future = kernel.requestExecute({ code: wrappedCode });
  return new Promise((resolve, reject) => {
    future.onIOPub = (msg) => {
      const msgType = msg.header.msg_type;

      // Handle result or display messages
      if (msgType === "execute_result" || msgType === "display_data") {
        const content = msg.content as any; // Narrow type for dynamic content
        if (content.data && content.data["text/plain"]) {
          const result = content.data["text/plain"];
          try {
            resolve(JSON.parse(result.slice(1, -1)));
          } catch (error) {
            resolve(result);
          }
        } else {
          reject("No valid data found in the response.");
        }
      }

      // Handle error messages
      if (msgType === "error") {
        const content = msg.content as any; // Narrow type for dynamic content
        reject(content.evalue || "An unknown error occurred.");
      }
    };

    future.onReply = (msg) => {
      if (msg.content.status === "error") {
        reject(msg.content.evalue || "An unknown error occurred.");
      }
    };
  });
}

/**
 * Format the output as a <PyTable /> component.
 */
function formatAsPyTable(data: any): string {
  const headers = JSON.stringify(data.columns);
  const rows = JSON.stringify(data.data);

  return `<PyTable 
    headers={${headers}}
    rows={${rows}}
  />`;
}

async function stopJupyterServer() {
  if (jupyterProcess) {
    jupyterProcess.kill();
    jupyterProcess = null;
    vscode.window.showInformationMessage("Jupyter server stopped.");
  }
}

export function deactivate() {
  stopJupyterServer();
}
