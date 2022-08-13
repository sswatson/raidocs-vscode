import * as vscode from 'vscode';

const startServer = async () => {
	let serverTerminal;
	for (let terminal of vscode.window.terminals) {
		if (terminal.name === 'raidocs server') {
			serverTerminal = terminal;
			break;
		}
	}
	if (!serverTerminal) {
		serverTerminal = vscode.window.createTerminal('raidocs server');
	}
	serverTerminal.sendText('nvm use 14.19.0');
	if (process.platform === 'darwin') {
		serverTerminal.sendText('(sleep 5 && open http://localhost:3000) &');
	}
  serverTerminal.sendText('pnpm dev');
	serverTerminal.show();
}

export default startServer;