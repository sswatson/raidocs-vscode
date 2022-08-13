import * as vscode from 'vscode';
import { getTerminal } from './utils';

const runCodeCells = async () => {
	const thisArticle = vscode.window.activeTextEditor?.document.fileName.split('site/pages')[1];
	if (!thisArticle || !thisArticle.endsWith(".md")) {
		vscode.window.showErrorMessage('This document is not a markdown file in site/pages');
		return;
	}
	const { terminal, openedNew } = getTerminal('raidocs code cells');
	if (openedNew) {
		terminal.sendText('nvm use 14.19.0');
	}
  terminal.sendText(`node tools/raidocs-parser.js -p site/pages${thisArticle}`);
	terminal.show();
}

export default runCodeCells;