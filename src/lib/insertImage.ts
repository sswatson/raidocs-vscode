import * as vscode from 'vscode';

const insertImage = async () => {
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
}

export default insertImage;