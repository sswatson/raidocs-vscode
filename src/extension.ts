import * as vscode from 'vscode';
import insertImage from './lib/insertImage';
import insertReference from './lib/insertReference';
import runCodeCells from './lib/runCodeCells';
import startServer from './lib/startServer';

export function activate(context: vscode.ExtensionContext) {

	const refCommand = vscode.commands.registerCommand(
		'raidocs.insertReference',
		insertReference
	);
	const imageCommand = vscode.commands.registerCommand(
		'raidocs.insertImage', 
		insertImage
	);
	const runCodeCellsCommand = vscode.commands.registerCommand(
		'raidocs.runCodeCells',
		runCodeCells
	);
	const startServerCommand = vscode.commands.registerCommand(
		'raidocs.startServer',
		startServer
	);
	context.subscriptions.push(refCommand);
	context.subscriptions.push(imageCommand);
	context.subscriptions.push(runCodeCellsCommand);
	context.subscriptions.push(startServerCommand);
}

// this method is called when your extension is deactivated
export function deactivate() {}
