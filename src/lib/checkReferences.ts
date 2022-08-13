import { getTerminal } from './utils';

const checkReferences = async () => {
	const { terminal } = getTerminal('raidocs references');
	terminal.sendText('nvm use 14.19.0');
  terminal.sendText('node tools/check-references.js');
	terminal.show();
}

export default checkReferences;