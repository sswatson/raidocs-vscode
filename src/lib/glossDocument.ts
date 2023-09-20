import * as vscode from 'vscode';
import { TextDecoder } from 'util';
import { distance as levenshtein } from 'fastest-levenshtein';
import { getGlossaryEntries, replaceSelectionWithGloss } from './glossSelection';

const options = {
  Gloss: "Gloss",
  Skip: "Skip",
  Stop: "Stop",
};

const firstThreeWords = (text: string) => {
  return text.slice(0, 100).split(/\s+/).slice(0, 3);
}

const selectAndShow = (editor: vscode.TextEditor, selection: vscode.Selection) => {
  editor.selection = selection;
  editor.revealRange(selection);
}

const suggestGloss = async (
  editor: vscode.TextEditor,
  entry: string,
  startOffset: number,
  endOffset: number,
) => {
  const document = editor.document;
  const startPosition = document.positionAt(startOffset);
  const endPosition = document.positionAt(endOffset);
  const selection = new vscode.Selection(
    startPosition,
    endPosition,
  );
  selectAndShow(editor, selection);
  const response = await vscode.window.showInformationMessage(
    `Gloss with "${entry}"?`,
    ...Object.keys(options)
  );
  if (response === options.Gloss) {
    replaceSelectionWithGloss(
      editor,
      selection,
      entry,
    );
  }
  return response;
}

const glossDocument = async () => {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || !folders.length) {
    vscode.window.showInformationMessage('no folder open');
    return;
  }
  const rootDir = folders[0].uri;
  const glossaryFileUri = vscode.Uri.joinPath(rootDir, "site/pages/help/glossary.mdx");
  // read contents of glossary:
  const glossaryFile = await vscode.workspace.fs.readFile(glossaryFileUri);
  const glossaryFileString = new TextDecoder().decode(glossaryFile);
  const entries = (
    getGlossaryEntries(glossaryFileString)
      .map(s => s.toLowerCase())
  );
  let found = 0;
  // replace current selection with entry:
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  // get the entire document:
  const document = editor.document;
  const documentText = document.getText();
  let offset = Math.max(
    document.offsetAt(editor.selection.active),
    document.offsetAt(editor.selection.anchor),
  ) + 1;
  const preamble = documentText.slice(0, offset + 1);
  const glossaryRegex = /<Glossary( key="([^"]*)")?>([^<]*)<\/Glossary>/g;
  const glossedEntries = new Set();
  // loop over all matches of regex in preamble:
  let match;
  while ((match = glossaryRegex.exec(preamble)) !== null) {
    const entry = match[2] || match[3];
    glossedEntries.add(entry);
  }
  // search forward looking for matches:
  while (offset < documentText.length) {
    offset += documentText.slice(offset).search(/ [^ ]/) + 1;
    const words = firstThreeWords(documentText.slice(offset));
    const possibleMatches = [...Array(3).keys()].map(k => {
      return words.slice(0, k + 1).join(" ");
    })
    if (words[0] === "*entity*") {
      console.log(possibleMatches);
    }
    outer: for (const possibleMatch of possibleMatches) {
      for (const entry of entries) {
        if (glossedEntries.has(entry)) continue;
        const distance = levenshtein(
          possibleMatch.replace(/[^ a-z]/ig, '').toLowerCase(),
          entry.toLowerCase(),
        );
        if (distance <= 1 && entry.length > 5 || distance === 0) {
          found++;
          const response = await suggestGloss(
            editor,
            entry,
            offset,
            offset + possibleMatch.length
          );
          if (response === options.Gloss) {
            glossedEntries.add(entry);
          } else if (response === options.Stop) {
            return;
          }
          break outer;
        }
      }
    }
    if (found) {
      break;
    }
    offset++;
  }
  if (found) {  
    vscode.commands.executeCommand("raidocs.glossDocument");
  } else {
    vscode.window.showInformationMessage("No more glossable items found");
    return;
  }
}

export default glossDocument;