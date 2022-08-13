import * as vscode from 'vscode';
// @ts-ignore
export async function* walk(dir: vscode.Uri) {
	for await (const [fileName, fileType] of await vscode.workspace.fs.readDirectory(dir)) {
		const entry = vscode.Uri.joinPath(dir, fileName);
		if (fileType === vscode.FileType.Directory) {
			yield* walk(entry);
		} else if (fileType === vscode.FileType.File) {
			yield entry;
		}
	}
}