import * as vscode from 'vscode';

export class PoseCodeLensProvider implements vscode.CodeLensProvider {

    public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
        const lenses: vscode.CodeLens[] = [];
        const text = document.getText();
        
        // Add a "View All" at the very top
        const topRange = new vscode.Range(0, 0, 0, 0);
        lenses.push(new vscode.CodeLens(topRange, {
            title: "$(eye) View All Poses in WarPath",
            command: "frc-pose-visualizer.openEditor",
            arguments: [{ all: true }]
        }));

        const braceRegex = /(Pose2d\[\]|List<Pose2d>)\s+(\w+)\s*=\s*\{([\s\S]*?)\}/g;
        const listOfRegex = /(Pose2d\[\]|List<Pose2d>)\s+(\w+)\s*=\s*List\.of\(([\s\S]*?)\)/g;
        const singleRegex = /Pose2d\s+(\w+)\s*=\s*([^;]+);/g;

        const processMatches = (regex: RegExp, varGroup: number, contentGroup: number) => {
            let match;
            while ((match = regex.exec(text)) !== null) {
                const line = document.lineAt(document.positionAt(match.index).line);
                const range = new vscode.Range(line.lineNumber, 0, line.lineNumber, 0);
                
                const content = match[contentGroup];
                const contentOffset = match.index + match[0].indexOf(content);

                const command: vscode.Command = {
                    title: `View ${match[varGroup]} in WarPath`,
                    command: "frc-pose-visualizer.openEditor",
                    arguments: [
                        {
                            variableName: match[varGroup],
                            content: content,
                            contentOffset: contentOffset
                        }
                    ]
                };
                
                lenses.push(new vscode.CodeLens(range, command));
            }
        };

        processMatches(braceRegex, 2, 3);
        processMatches(listOfRegex, 2, 3);
        processMatches(singleRegex, 1, 2);
        
        return lenses;
    }
}
