
import { TextDecoder } from 'util';
import * as vscode from 'vscode';
import { distance as levenshtein } from 'fastest-levenshtein';

export const newGlossaryEntry = async () => {
  const fileName = await vscode.window.showInputBox({
    prompt: 'Type your component name, then press enter',
    placeHolder: 'IntegrityConstraint'
  });
  if (!fileName) { return; }
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || !folders.length) {
    vscode.window.showInformationMessage('no folder open');
    return;
  }
  const rootDir = folders[0].uri;

  const indexFileUri = vscode.Uri.joinPath(rootDir, "site/glossary/index.js");
  const editor = await vscode.window.showTextDocument(indexFileUri);
  const { lineCount } = editor.document;
  const endOfFile = new vscode.Position(
    lineCount - 1,
    editor.document.lineAt(lineCount - 1).range.end.character,
  );
  const newLine = editor.document.getText().endsWith("\n") ? "" : "\n";
  await editor.edit(edit => edit.insert(
    endOfFile,
    `${newLine}export { default as ${fileName} } from 'glossary/${fileName}.mdx\n';`
  ));
  vscode.commands.executeCommand("workbench.action.files.save");

  const newComponentUri = vscode.Uri.joinPath(rootDir, 'site/glossary/' + fileName + '.mdx');
  await vscode.workspace.fs.writeFile(newComponentUri, new Uint8Array());
  
  const editor2 = await vscode.window.showTextDocument(newComponentUri);
  await editor2.edit(edit => edit.insert(
    new vscode.Position(0, 0),
    '{/* GLOSSARY */}\n'
  ));
  vscode.window.setStatusBarMessage('glossary entry added', 5000);
}

export const glossSelection = async () => {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || !folders.length) {
    vscode.window.showInformationMessage('no folder open');
    return;
  }
  const rootDir = folders[0].uri;
  const indexFileUri = vscode.Uri.joinPath(rootDir, "site/glossary/index.js");
  // read contents of idexFile: 
  const indexFile = await vscode.workspace.fs.readFile(indexFileUri);
  const indexFileString = new TextDecoder().decode(indexFile);
  // replace current selectin with entry:
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const selection = editor.selection;
    const selectedText = editor.document.getText(selection);
    const entries = indexFileString.split("\n").map(line => {
      const match = line.match(/export { default as (\w+)/);
      if (match) {
        return match[1];
      }
    }).filter(Boolean) as string[];
    const glossaryItem = await vscode.window.showQuickPick(
      entries.sort((a, b) => levenshtein(selectedText, a) - levenshtein(selectedText, b)),
    );
    if (!glossaryItem) { return; }
    const newText = `[${selectedText}](gloss:${glossaryItem})`;
    editor.edit(edit => edit.replace(selection, 
      `[${selectedText}](gloss:${glossaryItem})`
    ));
    // select the text we just inserted:
    const newSelection = new vscode.Selection(
      selection.start.line,
      selection.start.character,
      selection.start.line,
      selection.start.character + newText.length,
    );
    editor.selection = newSelection;
  }
}
