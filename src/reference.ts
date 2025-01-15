import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import MarkdownIt from "markdown-it";

async function findMDXFiles(workspaceDir: string): Promise<string[]> {
  const docsDir = path.join(workspaceDir, "src", "content", "docs");
  const mdxFiles: string[] = [];

  function walkDirectory(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDirectory(entryPath);
      } else if (entry.isFile() && entry.name.endsWith(".mdx")) {
        mdxFiles.push(entryPath);
      }
    }
  }

  walkDirectory(docsDir);
  return mdxFiles;
}

async function extractHeaders(filePath: string): Promise<{ header: string; slug: string }[]> {
    const md = new MarkdownIt();
    const { default: GithubSlugger } = await import("github-slugger"); // Dynamic import
    const slugger = new GithubSlugger();
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const tokens = md.parse(fileContent, {});
    const headers: { header: string; slug: string }[] = [];
  
    for (const token of tokens) {
      if (token.type === "heading_open") {
        const nextToken = tokens[tokens.indexOf(token) + 1];
        if (nextToken?.type === "inline") {
          const text = nextToken.content;
          const slug = slugger.slug(text);
          headers.push({ header: text, slug });
        }
      }
    }
  
    return headers;
  }

async function generateMasterList(workspaceDir: string): Promise<{ document: string; header: string; slug: string }[]> {
  const mdxFiles = await findMDXFiles(workspaceDir);
  const masterList: { document: string; header: string; slug: string }[] = [];

  for (const file of mdxFiles) {
    const relativePath = `/docs/${path.relative(path.join(workspaceDir, "src", "content", "docs"), file).replace(/\\/g, "/")}`;
    const headers = await extractHeaders(file);
    for (const { header, slug } of headers) {
      masterList.push({ document: relativePath, header, slug });
    }
  }

  return masterList;
}

async function showReferencePicker(masterList: { document: string; header: string; slug: string }[]) {
  const items = masterList.map((entry) => ({
    label: `${entry.header}`,
    description: entry.document,
    detail: `${entry.document}#${entry.slug}`,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: "Select a document and header to reference",
    matchOnDescription: true,
  });

  return selected?.detail;
}

async function performInsert(reference: string) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("No active editor found.");
    return;
  }

  const selection = editor.selection;
  const selectedText = editor.document.getText(selection);
  const referenceText = `[${selectedText || "reference"}](${reference})`;

  editor.edit((editBuilder) => {
    if (!selection.isEmpty) {
      editBuilder.replace(selection, referenceText);
    } else {
      editBuilder.insert(editor.selection.active, referenceText);
    }
  });
}

export async function insertReference() {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage("No workspace folder found.");
    return;
  }

  const workspaceDir = workspaceFolders[0].uri.fsPath;
  const masterList = await generateMasterList(workspaceDir);

  const reference = await showReferencePicker(masterList);
  if (reference) {
    await performInsert(reference);
  }
}
