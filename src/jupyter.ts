import { spawn } from "child_process";
import * as cheerio from "cheerio";
import { ServerConnection, KernelManager, Kernel } from "@jupyterlab/services";

let kernel: Kernel.IKernelConnection | null = null;
let kernelId: string | null = null;

import * as path from "path";
import * as vscode from "vscode";
import {
  getVirtualEnvDirectory,
  hideStatusBar,
  logMessage,
  updateStatusBar,
} from "./utils";

let jupyterProcess: ReturnType<typeof spawn> | null = null;
let jupyterServerUrl: string | null = null;

async function startJupyterServer(): Promise<string> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceFolder) {
    throw new Error("No workspace folder found.");
  }

  // Path to the jupyter executable in the virtual environment
  const jupyterPath = path.join(
    workspaceFolder,
    getVirtualEnvDirectory(),
    "bin",
    "jupyter"
  );

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

export async function restartKernel() {
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

function getCodeAtCursor() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("No active editor.");
    return;
  }

  const document = editor.document;
  const cursorPosition = editor.selection.active;
  const selection = editor.selection;
  const text = document.getText();

  let code: string | null = null;

  const selectionIsEmpty = selection.isEmpty;

  // Case 1: Execute selected text if non-empty
  if (!selectionIsEmpty) {
    code = document.getText(selection);
  } else {
    // Case 2: Fallback to executing the fenced code block under the cursor
    const fencedCodeRegex = /```(?:python|sql)\n([\s\S]*?)```/g;
    let match: RegExpExecArray | null;

    while ((match = fencedCodeRegex.exec(text)) !== null) {
      const start = document.positionAt(match.index);
      const end = document.positionAt(match.index + match[0].length);

      if (
        cursorPosition.isAfterOrEqual(start) &&
        cursorPosition.isBeforeOrEqual(end)
      ) {
        code = match[1];
        break;
      }
    }
  }

  return { code, selectionIsEmpty };
}

type Lang = "python" | "sql";

export async function runCodeAtCursor(lang: Lang = "python") {
  const codeAtCursor = getCodeAtCursor();
  if (!codeAtCursor || !codeAtCursor.code) {
    vscode.window.showErrorMessage("No code found to execute.");
    return;
  }
  const { code, selectionIsEmpty } = codeAtCursor;
  try {
    updateStatusBar(`Running ${lang === "python" ? "Python" : "SQL"} code...`);
    if (!kernel) {
      await startKernel();
    }
    const output = await wrapAndSendCodeToKernel(code, selectionIsEmpty, lang);
    if (output !== null) {
      const result =
        typeof output === "object"
          ? formatAsDataTable(output)
          : formatAsPyResult(output);

      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor.");
        return;
      }
      const document = editor.document;
      const cursorPosition = editor.selection.active;
      const text = document.getText();

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

        const insertionPosition = document.positionAt(nextBacktickIndex + 3);
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

export async function openJupyterInBrowser() {
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

async function wrapAndSendCodeToKernel(
  code: string,
  captureOutput = true,
  lang: Lang = "python"
): Promise<any> {
  if (!kernel) {
    throw new Error("Kernel is not running.");
  }

  let wrappedCode: string | null = null;

  if (lang === "python") {
    wrappedCode = captureOutput ? wrapCodeForJsonOutput(code) : code;
  } else if (lang === "sql") {
    wrappedCode = wrapSqlCode(code);
  } else {
    throw new Error(`Unsupported language: ${lang}`);
  }

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

      if (msgType === "stream") {
        const content = msg.content as any;
        const streamText = content.text || "";
        logMessage(`Stream: ${streamText.trim()}`);
      }

      if (msgType === "error") {
        const content = msg.content as any;
        logMessage(`Error: ${content.evalue}`);
        reject(content.evalue || "An unknown error occurred.");
      }

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
    vscode.window.showErrorMessage(`Error opening notebook: ${error.message}`);
  }
};

export async function stopJupyterServer() {
  if (jupyterProcess) {
    jupyterProcess.kill();
    jupyterProcess = null;
    vscode.window.showInformationMessage("Jupyter server stopped.");
  }
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

/**
 * Format the output as a <PyResult /> component.
 */
function formatAsPyResult(data: any): string {
  return `
<PyResult>
data
</PyResult>`.trim();
}

function wrapCodeForJsonOutput(code: string): string {
  const isExpressionCheckCode = `
import ast

def extract_last_expression(code):
    try:
        tree = ast.parse(code, mode='exec')
        # Look for the last statement in the code
        if tree.body and isinstance(tree.body[-1], ast.Expr):
            return ast.unparse(tree.body[-1].value)
        return None
    except SyntaxError:
        return None

print(extract_last_expression(${JSON.stringify(code)}))
`;
  const lastExpression = runPythonInProcess(isExpressionCheckCode);

  if (!lastExpression) {
    return code;
  }

  const codeWithoutLastExpression = code.replace(lastExpression, "").trim();

  const wrappedCode = `
import pandas as pd
import json

# User code
${codeWithoutLastExpression}

# Assign the last expression to raidocs_result
raidocs_result = ${lastExpression}

# Output JSON if raidocs_result is a DataFrame
if isinstance(raidocs_result, pd.DataFrame):
    def stringify_element(elem, dtype):
        singleton_df = pd.DataFrame({"col": [elem]}, dtype=dtype)
        return str(singleton_df).split("\\n0 ")[1].strip()
    
    formatted_df = raidocs_result.apply(lambda col: col.map(lambda x: stringify_element(x, raidocs_result.dtypes[col.name])))
    raidocs_final_result = formatted_df.to_json(orient="split")
else:
    raidocs_final_result = raidocs_result

raidocs_final_result
`.trim();

  return wrappedCode;
}

function wrapSqlCode(code: string): string {
  const wrappedCode = `
import duckdb
import pandas as pd
import json

if 'duckdb_connection' not in globals():
    duckdb_connection = duckdb.connect(database=':memory:')

try:
    # Execute the provided SQL code
    query_result = duckdb_connection.execute(${JSON.stringify(code)}).fetchdf()

    # Convert the result to JSON for rendering as a DataTable
    def stringify_element(elem, dtype):
        singleton_df = pd.DataFrame({"col": [elem]}, dtype=dtype)
        return str(singleton_df).split("\\n0 ")[1].strip()

    formatted_df = query_result.apply(lambda col: col.map(lambda x: stringify_element(x, query_result.dtypes[col.name])))
    raidocs_final_result = formatted_df.to_json(orient="split")
except Exception as e:
    raidocs_final_result = json.dumps({"error": str(e)})

raidocs_final_result
  `.trim();

  return wrappedCode;
}

function runPythonInProcess(code: string): string | null {
  const spawnSync = require("child_process").spawnSync;
  const pythonProcess = spawnSync("python3", ["-c", code], {
    encoding: "utf-8",
  });

  if (pythonProcess.error) {
    console.error("Error checking Python code:", pythonProcess.error.message);
    return null;
  }

  return pythonProcess.stdout;
}
