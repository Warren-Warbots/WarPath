import * as vscode from 'vscode';
import * as fs from 'fs';
import { PoseParser, PosePoint } from './PoseParser';
import { findPoseArrays, findPoseArrayByName } from './PoseFinder';
import { logChannel } from './extension';

interface PoseArray {
    name: string;
    points: PosePoint[];
}

interface OpenArgs {
    all?: boolean;
    variableName?: string;
    content?: string;
    contentOffset?: number;
    documentUri?: vscode.Uri;
}

export class PoseEditorPanel {
    public static currentPanel: PoseEditorPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _allArrays: PoseArray[] = [];
    private _documentUri: vscode.Uri | undefined;
    private _applyingEdit = false;

    public static createOrShow(context: vscode.ExtensionContext, args: OpenArgs) {
        const targetColumn = vscode.ViewColumn.Beside;

        if (PoseEditorPanel.currentPanel) {
            PoseEditorPanel.currentPanel._panel.reveal(targetColumn);
            PoseEditorPanel.currentPanel._rebindDocument(args?.documentUri);
            PoseEditorPanel.currentPanel._update(args);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'poseEditor',
            'WarPath',
            targetColumn,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(context.extensionUri, 'resources'),
                    vscode.Uri.joinPath(context.extensionUri, 'out')
                ]
            }
        );

        panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'resources', 'icon.png');

        PoseEditorPanel.currentPanel = new PoseEditorPanel(panel, context, args);
    }

    private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext, args: OpenArgs) {
        this._panel = panel;
        this._extensionUri = context.extensionUri;

        this._documentUri = args?.documentUri ?? vscode.window.activeTextEditor?.document.uri;

        this._panel.webview.html = this._getHtmlForWebview();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        vscode.workspace.onDidChangeTextDocument(e => {
            if (this._applyingEdit) return;
            if (this._documentUri && e.document.uri.toString() === this._documentUri.toString()) {
                this._update();
            }
        }, null, this._disposables);

        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('warpath.robotLength') || e.affectsConfiguration('warpath.robotWidth')) {
                this._update();
            }
        }, null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'updatePose':
                        await this._applyUpdate(message.arrayName, message.index, message.x, message.y, message.heading);
                        return;
                    case 'refresh':
                        await this._update();
                        return;
                    case 'ready':
                        this._update(args);
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    private _rebindDocument(uri: vscode.Uri | undefined) {
        if (uri && uri.toString() !== this._documentUri?.toString()) {
            this._documentUri = uri;
        }
    }

    private async _update(args?: OpenArgs) {
        if (!this._documentUri) {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;
            this._documentUri = editor.document.uri;
        }

        const document = await vscode.workspace.openTextDocument(this._documentUri);
        const text = document.getText();
        this._allArrays = [];

        for (const arr of findPoseArrays(text)) {
            const points = PoseParser.parse(arr.content, arr.contentOffset, document);
            if (points.length > 0) {
                this._allArrays.push({ name: arr.name, points });
            }
        }

        const config = vscode.workspace.getConfiguration('warpath');
        const robotLength = config.get<number>('robotLength', 1.0);
        const robotWidth = config.get<number>('robotWidth', 1.0);

        await this._panel.webview.postMessage({
            command: 'setAllData',
            showAll: args?.all,
            focus: args?.variableName,
            robotLength,
            robotWidth,
            arrays: this._allArrays.map(a => ({
                name: a.name,
                points: a.points.map(p => ({
                    x: p.x, y: p.y, heading: p.heading, headingWritable: p.headingWritable
                }))
            }))
        });
    }

    private async _applyUpdate(arrayName: string, index: number, x: number, y: number, heading?: number) {
        if (!this._documentUri) return;

        const document = await vscode.workspace.openTextDocument(this._documentUri);
        const text = document.getText();

        const match = findPoseArrayByName(text, arrayName);
        if (!match) {
            logChannel?.appendLine(`WarPath: could not locate array "${arrayName}" on write-back`);
            return;
        }

        const freshPoints = PoseParser.parse(match.content, match.contentOffset, document);
        const targetPoint = freshPoints[index];
        if (!targetPoint) {
            logChannel?.appendLine(`WarPath: index ${index} out of range for "${arrayName}" on write-back`);
            return;
        }

        const edit = new vscode.WorkspaceEdit();
        edit.replace(this._documentUri, targetPoint.xRange, x.toFixed(3));
        edit.replace(this._documentUri, targetPoint.yRange, y.toFixed(3));
        if (heading !== undefined) {
            if (targetPoint.headingWritable) {
                const finalHeading = targetPoint.isRadians ? (heading * Math.PI / 180).toFixed(4) : heading.toFixed(1);
                edit.replace(this._documentUri, targetPoint.hRange, finalHeading);
            } else {
                logChannel?.appendLine(`WarPath: heading for "${arrayName}[${index}]" uses a Rotation2d.k* constant — skipping heading write`);
            }
        }

        this._applyingEdit = true;
        try {
            await vscode.workspace.applyEdit(edit);
        } finally {
            this._applyingEdit = false;
        }
    }

    private _getHtmlForWebview(): string {
        const webview = this._panel.webview;
        const fieldImagePath = vscode.Uri.joinPath(this._extensionUri, 'resources', 'field26.png');
        const htmlPath = vscode.Uri.joinPath(this._extensionUri, 'resources', 'webview.html').fsPath;
        const template = fs.readFileSync(htmlPath, 'utf8');
        const nonce = getNonce();
        return template
            .replaceAll('{{IMAGE_URI}}', webview.asWebviewUri(fieldImagePath).toString())
            .replaceAll('{{CSP_SOURCE}}', webview.cspSource)
            .replaceAll('{{NONCE}}', nonce);
    }

    public dispose() {
        PoseEditorPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
