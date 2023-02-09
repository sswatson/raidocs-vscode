import * as vscode from 'vscode';
const GitHubSlugger = require('github-slugger');
const slugger = new GitHubSlugger();
import { walk } from './utils';

const insertReference = async () => {
	const folders = vscode.workspace.workspaceFolders;
	if (!folders || !folders.length) {
		vscode.window.showInformationMessage('no folder open');
		return;
	}
	const thisArticle = vscode.window.activeTextEditor?.document.fileName;
	const rootDir = folders[0].uri;
	const pagesDir = vscode.Uri.joinPath(rootDir, "site/pages");
	let articles: {label: string, file: vscode.Uri, currentFile: boolean}[] = [];
	for await (let file of walk(pagesDir)) {
		const fileName = file.toString();
		if (fileName.endsWith(".mdx")) {
			const label = fileName.split('site/pages')[1].replace(/.mdx$/g, '').slice(1);
			const currentFile = Boolean(thisArticle && fileName.endsWith(thisArticle));
			if (label !== 'index') {
				const newArticle = {
					label,
					file,
					currentFile,
				};
				articles.push(newArticle);	
				if (newArticle.currentFile) {
					articles.unshift(newArticle);
				}
			}
		}
	}
	const selectedArticle = await vscode.window.showQuickPick(articles);
	if (selectedArticle) {
		const contentBytes = await vscode.workspace.fs.readFile(
			selectedArticle.file
		);
		const contents = Buffer.from(contentBytes).toString();
		const headers = [{label: '(no section)', ref: ''}];
		slugger.reset();
		for (let line of contents.split('\n')) {
			if (line.match(/^#+ /)) { // match header lines
				const customId = line.match(/ \[#([^]+?)]$/);
				let ref: string;
				if (customId) {
					ref = customId[1];
				} else {
					ref = slugger.slug(line.replace(/^#+ /, '').trim());
				}
				headers.push({
					label: line
						.replace(/^#+/, (m) => m.replace(/#/g, '  '))
						.replace(/^  /, ''),
					ref
				});
			}
		}
		const selectedHeader = await vscode.window.showQuickPick(headers);
		if (selectedHeader) {
			const editor = vscode.window.activeTextEditor;
			if (editor) {
				const { active, anchor } = editor.selection;
				const href = (selectedArticle.currentFile
							? '' 
							: '/' + selectedArticle.label) + 
						(selectedHeader.ref 
							? '#' 
							: '') + 
						 selectedHeader.ref
				if (active.isEqual(anchor)) {
					editor.edit(edit => edit.insert(
						editor.selection.active,
						href
					));
				} else {
					const selection = new vscode.Range(active, anchor);
					const selectedText = editor.document.getText(selection);
					editor.edit(edit => edit.replace(
						selection,
						`[${selectedText}](${href})`
					));
				}
			}
		}
	}
}

export default insertReference;