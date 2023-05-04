import * as vscode from 'vscode';
import { getTerminal } from './utils';

const runCodeCells = async ({ all }={ all: false }) => {
	let activeEditor = vscode.window.activeTextEditor;	
	if (!activeEditor) return;
	let document = activeEditor.document;
	const thisArticle = document.fileName.split('site/pages')[1];
	if (!thisArticle || !thisArticle.endsWith(".mdx")) {
		vscode.window.showErrorMessage(
			'This document is not a markdown file in site/pages'
		);
		return;
	}
	let currentPosition = activeEditor.selection.active;
	const { terminal, openedNew } = getTerminal('raidocs code cells');
	if (openedNew) {
		terminal.sendText('nvm use 18.13.0');
	}
	const pathOpt = `-p site/pages${thisArticle}`;
	const lineNumberOpt = all ? '' : `-l ${currentPosition.line}`;
  terminal.sendText(
		`node tools/raidocs-parser.js ${pathOpt} ${lineNumberOpt}`
	);
	terminal.show();
}

export default runCodeCells;