import * as vscode from 'vscode';

const runCodeCells = async () => {
	const thisArticle = vscode.window.activeTextEditor?.document.fileName.split('site/pages')[1];
	if (!thisArticle || !thisArticle.endsWith(".md")) {
		vscode.window.showErrorMessage('This document is not a markdown file in site/pages');
		return;
	}
	let raidocsTerminal;
	let newTerm = true;
	for (let terminal of vscode.window.terminals) {
		if (terminal.name === 'raidocs parser') {
			raidocsTerminal = terminal;
			newTerm = false;
			break;
		}
	}
	if (!raidocsTerminal) {
		raidocsTerminal = vscode.window.createTerminal('raidocs parser');
	}
	if (newTerm) {
		raidocsTerminal.sendText('nvm use 14.19.0');
	}
  raidocsTerminal.sendText(`node tools/raidocs-parser.js -p site/pages${thisArticle}`);
	raidocsTerminal.show();
}

export default runCodeCells;