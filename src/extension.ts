import { spawn } from "child_process";
import { ServerConnection, KernelManager, Kernel } from "@jupyterlab/services";
import * as path from "path";
import * as vscode from "vscode";
import * as cheerio from "cheerio";
import { insertReference } from "./reference.js";

let kernel: Kernel.IKernelConnection | null = null;
let jupyterProcess: ReturnType<typeof spawn> | null = null;
let jupyterServerUrl: string | null = null;
let statusBarItem: vscode.StatusBarItem | null = null;
let kernelId: string | null = null;
let outputChannel: vscode.OutputChannel | null = null;

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

function logMessage(message: string) {
  if (!outputChannel) {
    return;
  }
  outputChannel.appendLine(message);
  outputChannel.show(true); // Bring the output channel to the front if hidden
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
        cwd: workspaceFolder,
      }
    );

    jupyterProcess = jupyter;

    jupyter.stderr?.on("data", (data) => {
      const output = data.toString();
      const urlMatch = output.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (urlMatch) {
        jupyterServerUrl = urlMatch[0];
        resolve(jupyterServerUrl as string);
      }
    });

    jupyter.on("error", (err) => {
      reject(`Failed to start Jupyter server: ${err.message}`);
    });

    jupyter.on("close", (code) => {
      if (code !== 0 && jupyterServerUrl) {
        reject(`Jupyter server exited with code ${code}`);
      }
    });
  });
}

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel("RelationalAI Docs");
  context.subscriptions.push(outputChannel);

  const runPythonCodeCommand = vscode.commands.registerCommand(
    "raidocs.runPythonCode",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor.");
        return;
      }

      const document = editor.document;
      const cursorPosition = editor.selection.active;
      const selection = editor.selection;
      const text = document.getText();

      let pythonCode: string | null = null;

      const selectionIsEmpty = selection.isEmpty;

      // Case 1: Execute selected text if non-empty
      if (!selectionIsEmpty) {
        pythonCode = document.getText(selection);
      } else {
        // Case 2: Fallback to executing the fenced code block under the cursor
        const fencedCodeRegex = /```python\n([\s\S]*?)```/g;
        let match: RegExpExecArray | null;

        while ((match = fencedCodeRegex.exec(text)) !== null) {
          const start = document.positionAt(match.index);
          const end = document.positionAt(match.index + match[0].length);

          if (
            cursorPosition.isAfterOrEqual(start) &&
            cursorPosition.isBeforeOrEqual(end)
          ) {
            pythonCode = match[1];
            break;
          }
        }
      }

      if (!pythonCode) {
        vscode.window.showErrorMessage("No Python code found to execute.");
        return;
      }

      try {
        updateStatusBar("Running Python code...");

        if (!kernel) {
          await startKernel();
        }

        const output = await executePythonCode(pythonCode, selectionIsEmpty);

        if (output !== null) {
          const result =
            typeof output === "object" ? formatAsDataTable(output) : output;

          editor.edit((editBuilder) => {
            // Find the next triple backtick relative to the cursor position
            const nextBacktickIndex = text.indexOf(
              "```",
              document.offsetAt(cursorPosition)
            );
            if (nextBacktickIndex === -1) {
              vscode.window.showErrorMessage(
                "No next triple backtick found in the document."
              );
              return;
            }

            const insertionPosition = document.positionAt(
              nextBacktickIndex + 3
            );
            editBuilder.insert(insertionPosition, `\n\n${result}`);
          });
          updateStatusBar("success; output inserted");
        } else {
          updateStatusBar("success; no output");
        }

        setTimeout(hideStatusBar, 3000);
      } catch (error) {
        vscode.window.showErrorMessage(`Error executing Python code: ${error}`);
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

  const openNotebookInBrowser = async (kernelId: string) => {
    if (!jupyterServerUrl || !kernelId) {
      vscode.window.showErrorMessage(
        "Jupyter server or kernel is not running. Please start them first."
      );
      return;
    }

    try {
      // Create a new untitled notebook
      const response = await fetch(`${jupyterServerUrl}/api/contents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "notebook",
          format: "json",
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to create a new notebook. Status: ${response.status}`
        );
      }

      const notebookData: any = await response.json();
      const notebookPath = notebookData.path;

      // Start a kernel session for the notebook
      const kernelSessionResponse = await fetch(
        `${jupyterServerUrl}/api/sessions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kernel: { id: kernelId },
            name: notebookPath.split("/").pop(),
            path: notebookPath,
            type: "notebook",
          }),
        }
      );

      if (!kernelSessionResponse.ok) {
        throw new Error(
          `Failed to associate the kernel. Status: ${kernelSessionResponse.status}`
        );
      }

      // Open the notebook in the browser
      const url = `${jupyterServerUrl}/notebooks/${encodeURIComponent(
        notebookPath
      )}`;
      vscode.env.openExternal(vscode.Uri.parse(url));
    } catch (error: any) {
      vscode.window.showErrorMessage(
        `Error opening notebook: ${error.message}`
      );
    }
  };

  const openJupyterInBrowserCommand = vscode.commands.registerCommand(
    "raidocs.openJupyterInBrowser",
    async () => {
      if (!jupyterServerUrl || !kernelId) {
        vscode.window.showErrorMessage(
          "Jupyter server or kernel is not running. Please start them first."
        );
        return;
      }

      try {
        await openNotebookInBrowser(kernelId);
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to open notebook in the browser: ${(error as any).message}`
        );
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
            const img = `![${imgName.replace(
              /\.[a-z]*$/,
              ""
            )}](/img/${imgName})`;
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

  const insertReferenceCommand = vscode.commands.registerCommand(
    "raidocs.insertReference",
    insertReference
  );

  context.subscriptions.push(
    runPythonCodeCommand,
    restartKernelCommand,
    openJupyterInBrowserCommand,
    stopServerCommand,
    insertImageCommand,
    insertReferenceCommand,
  );
}

/**
 * Start a Jupyter kernel if one is not already running.
 */
async function startKernel() {
  if (!jupyterProcess) {
    updateStatusBar("Starting Jupyter server...");
    logMessage("Starting Jupyter server...");
    const serverUrl = await startJupyterServer();
    updateStatusBar(`Jupyter server started`);
    logMessage(`Jupyter server started at ${serverUrl}`);
  }

  const settings = ServerConnection.makeSettings({
    baseUrl: "http://127.0.0.1:8888/", // Adjust port dynamically if needed
    token: "", // Empty since we disabled authentication
  });

  const kernelManager = new KernelManager({ serverSettings: settings });
  kernel = await kernelManager.startNew();
  kernelId = kernel?.id || null;
  logMessage(`Kernel started: ${kernel?.id}`);
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

  const lastLine = lines[lastCodeLineIndex];

  // Use Python's AST module to check if the last line is an expression
  const isExpressionCheckCode = `
import ast
def is_expression(line):
    try:
        node = ast.parse(line, mode='eval')
        return isinstance(node.body, ast.expr)
    except SyntaxError:
        return False
print(is_expression(${JSON.stringify(lastLine)}))
  `.trim();

  // Determine if the last line is an expression
  const isExpression = executePythonCheck(isExpressionCheckCode);

  if (!isExpression) {
    return code;
  }

  // Wrap the code, assigning the last expression to raidocs_result
  const wrappedCode = `
import pandas as pd
import json

# User code
${lines.slice(0, lastCodeLineIndex).join("\n")}

# Assign the last expression to raidocs_result
raidocs_result = ${lastLine}

# Output JSON if raidocs_result is a DataFrame
if isinstance(raidocs_result, pd.DataFrame):
    formatted_df = raidocs_result.apply(lambda col:
      col.map(lambda x: str(pd.DataFrame({"col": [x]})).split("\\n0 ")[1].strip())
    )
    raidocs_final_result = formatted_df.to_json(orient="split")
else:
    raidocs_final_result = raidocs_result

raidocs_final_result
`.trim();

  return wrappedCode;
}

function executePythonCheck(code: string): boolean {
  const spawnSync = require("child_process").spawnSync;
  const pythonProcess = spawnSync("python3", ["-c", code], {
    encoding: "utf-8",
  });

  if (pythonProcess.error) {
    console.error("Error checking Python code:", pythonProcess.error.message);
    return false;
  }

  return pythonProcess.stdout.trim() === "True";
}

async function executePythonCode(code: string, captureOutput=true): Promise<any> {
  if (!kernel) {
    throw new Error("Kernel is not running.");
  }

  const wrappedCode = captureOutput ? wrapCodeForJsonOutput(code) : code;

  console.log(wrappedCode);

  const future = kernel.requestExecute({ code: wrappedCode });

  return new Promise((resolve, reject) => {
    let resultFound = false;
    let output: any = null;

    future.onIOPub = (msg) => {
      const msgType = msg.header.msg_type;

      // Handle result or display messages
      if (msgType === "execute_result" || msgType === "display_data") {
        resultFound = true;
        const content = msg.content as any;
        if (content.data) {
          // Extract and log plain text from HTML if available
          if (content.data["text/html"]) {
            const htmlOutput = content.data["text/html"];
            const $ = cheerio.load(htmlOutput);
            const textContent = $.text();
            if (textContent) {
              logMessage(`HTML Output (text): ${textContent}`);
            }
          }

          // Fall back to text/plain representation
          if (content.data["text/plain"] && !content.data["text/html"]) {
            const textOutput = content.data["text/plain"];
            logMessage(`Text Output: ${textOutput}`);
            try {
              output = JSON.parse(textOutput.slice(1, -1));
            } catch (error) {
              output = textOutput;
            }
          }

          // Handle other representations
          if (!content.data["text/plain"] && !content.data["text/html"]) {
            logMessage(`Other Output: ${JSON.stringify(content.data)}`);
          }
        }
      }

      // Handle stream (stdout/stderr) messages
      if (msgType === "stream") {
        const content = msg.content as any;
        const streamText = content.text || "";
        logMessage(`Stream: ${streamText.trim()}`);
      }

      // Handle error messages
      if (msgType === "error") {
        const content = msg.content as any;
        logMessage(`Error: ${content.evalue}`);
        reject(content.evalue || "An unknown error occurred.");
      }

      // Handle status messages (busy → idle)
      if (msgType === "status") {
        const content = msg.content as { execution_state?: string };
        logMessage(`Kernel status: ${content.execution_state}`);
        if (content.execution_state === "idle") {
          if (resultFound) {
            resolve(output);
          } else {
            resolve(null); // No result, but execution completed
          }
        }
      }
    };

    future.onReply = (msg) => {
      if (msg.content.status === "error") {
        logMessage(`Reply error: ${msg.content.evalue}`);
        reject(msg.content.evalue || "An unknown error occurred.");
      }
    };

    future.done.then(() => {
      if (!resultFound) {
        logMessage("Execution completed with no result.");
        resolve(null); // Ensure the promise resolves even if no output
      }
    });
  });
}

/**
 * Format the output as a <PyTable /> component.
 */
function formatAsDataTable(data: any): string {
  const headers = data.columns.map(JSON.stringify).join(",");
  const rows = data.data.map(JSON.stringify).join(",\n    ");

  return `
<DataTable 
  headers={[
    ${headers}
  ]}
  rows={[
    ${rows}
  ]}
/>`.trim();
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
