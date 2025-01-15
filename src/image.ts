import * as vscode from "vscode";
import * as path from "path";

export async function insertImage() {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || !folders.length) {
    vscode.window.showInformationMessage("no folder open");
    return;
  }
  const imgDir = path.join(folders[0].uri.fsPath, "public/img");
  const selectedUris = await vscode.window.showOpenDialog({
    canSelectMany: false,
    openLabel: "Select Image",
    filters: {
      Images: ["png", "jpg", "jpeg", "svg", "webp"],
    },
  });
  if (selectedUris) {
    const imgPath = selectedUris[0].toString();
    const imgName = imgPath.split("/").pop();
    if (imgName) {
      vscode.workspace.fs.copy(
        selectedUris[0],
        vscode.Uri.joinPath(vscode.Uri.file(imgDir), imgName)
      );
      if (vscode?.window?.activeTextEditor) {
        const img = `![${imgName.replace(/\.[a-z]*$/, "")}](/img/${imgName})`;
        vscode.window.activeTextEditor.edit((edit) => {
          if (vscode?.window?.activeTextEditor) {
            edit.insert(vscode.window.activeTextEditor.selection.active, img);
          }
        });
      }
    }
  }
}
