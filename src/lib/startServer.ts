import * as vscode from 'vscode';
import { getTerminal } from './utils';

const startServer = async () => {
	const { terminal } = getTerminal('raidocs server');
	terminal.sendText('nvm use 18.13.0');
	if (process.platform === 'darwin') {
		terminal.sendText('(sleep 5 && open http://localhost:3000) &');
	}
  terminal.sendText('pnpm dev');
	terminal.show();
}

export default startServer;