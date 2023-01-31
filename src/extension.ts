import * as vscode from 'vscode';
import insertImage from './lib/insertImage';
import insertReference from './lib/insertReference';
import runCodeCells from './lib/runCodeCells';
import startServer from './lib/startServer';
import checkReferences from './lib/checkReferences';
import glossSelection from './lib/glossSelection';
import glossDocument from './lib/glossDocument';

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
		runCodeCells,
	);
	const runAllCodeCellsCommand = vscode.commands.registerCommand(
		'raidocs.runAllCodeCells',
		() => runCodeCells({ all: true }),
	);
	const startServerCommand = vscode.commands.registerCommand(
		'raidocs.startServer',
		startServer
	);
	const checkReferencesCommand = vscode.commands.registerCommand(
		'raidocs.checkReferences',
		checkReferences
	);
	const glossSelectionCommand = vscode.commands.registerCommand(
		'raidocs.glossSelection',
		glossSelection
	);
	const glossDocumentCommand = vscode.commands.registerCommand(
		'raidocs.glossDocument',
		glossDocument
	);
	context.subscriptions.push(refCommand);
	context.subscriptions.push(imageCommand);
	context.subscriptions.push(runCodeCellsCommand);
	context.subscriptions.push(runAllCodeCellsCommand);
	context.subscriptions.push(startServerCommand);
	context.subscriptions.push(checkReferencesCommand);
	context.subscriptions.push(glossSelectionCommand);
	context.subscriptions.push(glossDocumentCommand);
}

// this method is called when your extension is deactivated
export function deactivate() {}
