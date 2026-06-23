import * as vscode from 'vscode';
import { PoseCodeLensProvider } from './CodeLensProvider';
import { PoseEditorPanel } from './PoseEditorPanel';

export let logChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
    logChannel = vscode.window.createOutputChannel("WarPath");
    logChannel.appendLine('WarPath is now active!');

    const codeLensProvider = new PoseCodeLensProvider();
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider({ language: 'java', scheme: 'file' }, codeLensProvider)
    );

    const disposable = vscode.commands.registerCommand('frc-pose-visualizer.openEditor', (args) => {
        const documentUri = vscode.window.activeTextEditor?.document.uri;
        PoseEditorPanel.createOrShow(context, { ...args, documentUri });
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}
