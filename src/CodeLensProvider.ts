import * as vscode from 'vscode';
import { findPoseArrays } from './PoseFinder';

export class PoseCodeLensProvider implements vscode.CodeLensProvider {

    public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
        const lenses: vscode.CodeLens[] = [];
        const text = document.getText();

        const topRange = new vscode.Range(0, 0, 0, 0);
        lenses.push(new vscode.CodeLens(topRange, {
            title: "$(eye) View All Poses in WarPath",
            command: "frc-pose-visualizer.openEditor",
            arguments: [{ all: true }]
        }));

        for (const arr of findPoseArrays(text)) {
            const line = document.lineAt(document.positionAt(arr.contentOffset).line);
            const range = new vscode.Range(line.lineNumber, 0, line.lineNumber, 0);
            lenses.push(new vscode.CodeLens(range, {
                title: `View ${arr.name} in WarPath`,
                command: "frc-pose-visualizer.openEditor",
                arguments: [{
                    variableName: arr.name,
                    content: arr.content,
                    contentOffset: arr.contentOffset
                }]
            }));
        }

        return lenses;
    }
}
