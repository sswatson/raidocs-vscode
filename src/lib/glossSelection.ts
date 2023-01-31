import * as vscode from 'vscode';
import { TextDecoder } from 'util';
import { distance as levenshtein } from 'fastest-levenshtein';

export const slug = (str: string) => str.replace(/ /g, '-').toLowerCase();

export const replaceSelectionWithGloss = (
  editor: vscode.TextEditor,
  selection: vscode.Selection,
  glossaryItem: string,
) => {
  const key = slug(glossaryItem)
  const selectedText = editor.document.getText(selection);
  const newText = (
    slug(selectedText) === key
      ? `<Glossary>${selectedText}</Glossary>`
      : `<Glossary key="${key}">${selectedText}</Glossary>`
  );
  editor.edit(edit => edit.replace(selection, 
    newText
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

export const getGlossaryEntries = (glossaryFileString: string) => {
  return glossaryFileString.split("\n").map(line => {
    const match = line.match(/^## (.*)$/);
    if (match) {
      return match[1].trim();
    }
  }).filter(Boolean) as string[];
}

const glossSelection = async () => {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || !folders.length) {
    vscode.window.showInformationMessage('no folder open');
    return;
  }
  const rootDir = folders[0].uri;
  const glossaryFileUri = vscode.Uri.joinPath(rootDir, "site/pages/help/glossary.md");
  // read contents of glossary:
  const glossaryFile = await vscode.workspace.fs.readFile(glossaryFileUri);
  const glossaryFileString = new TextDecoder().decode(glossaryFile);
  // replace current selection with entry:
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const selection = editor.selection;
    const selectedText = editor.document.getText(selection);
    const entries = getGlossaryEntries(glossaryFileString);
    const glossaryItem = await vscode.window.showQuickPick(
      entries.sort((a, b) => (
        levenshtein(selectedText, a) - levenshtein(selectedText, b))
      ),
    );
    if (!glossaryItem) { return; }
    replaceSelectionWithGloss(editor, selection, glossaryItem);
  }
}

export default glossSelection;