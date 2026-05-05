import * as vscode from 'vscode';
import { PoseCodeLensProvider } from './CodeLensProvider';
import { PoseEditorPanel } from './PoseEditorPanel';

export let logChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
	logChannel = vscode.window.createOutputChannel("WarPath");
	logChannel.appendLine('WarPath is now active!');

	const codeLensProvider = new PoseCodeLensProvider();
// ... rest of code stays similar but uses logChannel
	context.subscriptions.push(
		vscode.languages.registerCodeLensProvider({ language: 'java', scheme: 'file' }, codeLensProvider)
	);

	let disposable = vscode.commands.registerCommand('frc-pose-visualizer.openEditor', (args) => {
		PoseEditorPanel.createOrShow(context, args);
	});

	context.subscriptions.push(disposable);
}

export function deactivate() {}
