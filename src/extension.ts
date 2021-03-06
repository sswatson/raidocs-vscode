import * as vscode from 'vscode';
const GitHubSlugger = require('github-slugger');
const slugger = new GitHubSlugger();

// @ts-ignore
async function* walk(dir: vscode.Uri) {
	for await (const [fileName, fileType] of await vscode.workspace.fs.readDirectory(dir)) {
		const entry = vscode.Uri.joinPath(dir, fileName);
		if (fileType === vscode.FileType.Directory) {
			yield* walk(entry);
		} else if (fileType === vscode.FileType.File) {
			yield entry;
		}
	}
}

export function activate(context: vscode.ExtensionContext) {

	const refCommand = vscode.commands.registerCommand(
		'raidocs.insertReference', 
		async () => {
			const folders = vscode.workspace.workspaceFolders;
			if (!folders || !folders.length) {
				vscode.window.showInformationMessage('no folder open');
				return;
			}
			const rootDir = folders[0].uri;
			const pagesDir = vscode.Uri.joinPath(rootDir, "site/pages");
			let articles = [];
			for await (let file of walk(pagesDir)) {
				const fileName = file.toString();
				if (fileName.endsWith(".md")) {
					articles.push({
						label:
						fileName.split('site/pages')[1].replace(/.md$/g, '').slice(1),
						file
					});
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
						editor.edit(edit => edit.insert(
							editor.selection.active,
							'/' + selectedArticle.label + 
							(selectedHeader.ref ? '#' : '') + 
  						 selectedHeader.ref
						));
					}
				}
			}
		});
		const imageCommand = vscode.commands.registerCommand(
			'raidocs.insertImage', 
			async () => {
				const folders = vscode.workspace.workspaceFolders;
				if (!folders || !folders.length) {
					vscode.window.showInformationMessage('no folder open');
					return;
				}
				if (vscode?.window?.activeTextEditor) {
					const imgDir = vscode
						.window
						.activeTextEditor
						.document
						.fileName
						.replace("pages", "public")
						.replace(/\.md$/,'');
					const selectedUris = await vscode.window.showOpenDialog({
						canSelectMany: false,
						openLabel: "Select Image",
						filters: {
							'Images': ['png', 'jpg', 'jpeg', 'svg']
						},
					});
					if (selectedUris) {
						const imgPath = selectedUris[0].toString();
						const imgName = imgPath.split('/').pop();
						if (imgName) {
							vscode.workspace.fs.copy(
								selectedUris[0], 
								vscode.Uri.joinPath(vscode.Uri.file(imgDir), imgName)
							);
							if (vscode?.window?.activeTextEditor) {
								const img = `<ImgFig
  src="${imgDir.split('site/public')[1] + '/' + imgName}"
  width="90%"
  alt="${imgName.replace(/\.[a-z]*$/, '')}"
/>`;
								vscode.window.activeTextEditor.edit(edit => {
									if (vscode?.window?.activeTextEditor) {
										edit.insert(
											vscode.window.activeTextEditor.selection.active,
											img
										)
									}
								});
							}
						}
					}
				}
			});		
	context.subscriptions.push(refCommand);
	context.subscriptions.push(imageCommand);
}

// this method is called when your extension is deactivated
export function deactivate() {}
