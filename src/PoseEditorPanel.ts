import * as vscode from 'vscode';
import { PoseParser, PosePoint } from './PoseParser';
import { logChannel } from './extension';

interface PoseArray {
    name: string;
    points: PosePoint[];
}

export class PoseEditorPanel {
    public static currentPanel: PoseEditorPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private _allArrays: PoseArray[] = [];
    private _documentUri: vscode.Uri | undefined;

    public static createOrShow(context: vscode.ExtensionContext, args: any) {
        const targetColumn = vscode.ViewColumn.Beside;

        if (PoseEditorPanel.currentPanel) {
            PoseEditorPanel.currentPanel._panel.reveal(targetColumn);
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

        PoseEditorPanel.currentPanel = new PoseEditorPanel(panel, context, args);
    }

    private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext, args: any) {
        this._panel = panel;
        
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            this._documentUri = editor.document.uri;
        }

        const onDiskPath = vscode.Uri.joinPath(context.extensionUri, 'resources', 'field26.png');
        const fieldImageUri = this._panel.webview.asWebviewUri(onDiskPath);

        this._panel.webview.html = this._getHtmlForWebview(fieldImageUri);
        
        setTimeout(() => this._update(args), 300);

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        vscode.workspace.onDidChangeTextDocument(e => {
            if (this._documentUri && e.document.uri.toString() === this._documentUri.toString()) {
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

    private async _update(args?: any) {
        if (!this._documentUri) {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;
            this._documentUri = editor.document.uri;
        }

        const document = await vscode.workspace.openTextDocument(this._documentUri);
        const text = document.getText();
        this._allArrays = [];
        
        const braceRegex = /(Pose2d\[\]|List<Pose2d>)\s+(\w+)\s*=\s*\{([\s\S]*?)\}/g;
        const listOfRegex = /(Pose2d\[\]|List<Pose2d>)\s+(\w+)\s*=\s*List\.of\(([\s\S]*?)\)/g;
        const singleRegex = /Pose2d\s+(\w+)\s*=\s*([^;]+);/g;

        const parseRegex = (regex: RegExp, varGroup: number, contentGroup: number) => {
            let match;
            while ((match = regex.exec(text)) !== null) {
                const varName = match[varGroup];
                const content = match[contentGroup];
                const contentOffset = match.index + match[0].indexOf(content);
                const points = PoseParser.parse(content, contentOffset, document);
                if (points.length > 0) {
                    this._allArrays.push({ name: varName, points });
                }
            }
        };

        parseRegex(braceRegex, 2, 3);
        parseRegex(listOfRegex, 2, 3);
        parseRegex(singleRegex, 1, 2);
        
        await this._panel.webview.postMessage({
            command: 'setAllData',
            showAll: args?.all,
            focus: args?.variableName,
            arrays: this._allArrays.map(a => ({
                name: a.name,
                points: a.points.map(p => ({ x: p.x, y: p.y, heading: p.heading }))
            }))
        });
    }

    private async _applyUpdate(arrayName: string, index: number, x: number, y: number, heading?: number) {
        if (!this._documentUri) return;

        const document = await vscode.workspace.openTextDocument(this._documentUri);
        const text = document.getText();

        const braceRegex = new RegExp(`(Pose2d\\[\\]|List<Pose2d>)\\s+${arrayName}\\s*=\\s*\\{([\\s\\S]*?)\\}`, 'g');
        const listOfRegex = new RegExp(`(Pose2d\\[\\]|List<Pose2d>)\\s+${arrayName}\\s*=\\s*List\\.of\\(([\\s\\S]*?)\\)`, 'g');
        const singleRegex = new RegExp(`Pose2d\\s+${arrayName}\\s*=\\s*([^;]+);`, 'g');

        let match = braceRegex.exec(text) || listOfRegex.exec(text);
        let contentGroup = 2;
        if (!match) {
            match = singleRegex.exec(text);
            contentGroup = 1;
        }
        if (!match) return;

        const content = match[contentGroup];
        const contentOffset = match.index + match[0].indexOf(content);
        const freshPoints = PoseParser.parse(content, contentOffset, document);
        
        if (freshPoints && freshPoints[index]) {
            const targetPoint = freshPoints[index];
            const edit = new vscode.WorkspaceEdit();
            edit.replace(this._documentUri, targetPoint.xRange, x.toFixed(3));
            edit.replace(this._documentUri, targetPoint.yRange, y.toFixed(3));
            if (heading !== undefined) {
                const finalHeading = targetPoint.isRadians ? (heading * Math.PI / 180).toFixed(4) : heading.toFixed(1);
                edit.replace(this._documentUri, targetPoint.hRange, finalHeading);
            }
            
            await vscode.workspace.applyEdit(edit);
        }
    }

    private _getHtmlForWebview(imageUri: vscode.Uri) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <style>
        body { margin: 0; display: flex; flex-direction: column; height: 100vh; background: #1e1e1e; color: white; font-family: sans-serif; overflow: hidden; }
        canvas { background: #222; cursor: crosshair; flex-grow: 1; touch-action: none; }
        .toolbar { padding: 10px; background: #333; border-bottom: 1px solid #444; display: flex; justify-content: space-between; align-items: center; }
        .legend { display: flex; gap: 12px; font-size: 13px; overflow-x: auto; padding: 10px; background: #222; border-bottom: 1px solid #444; min-height: 20px; }
        .legend-item { display: flex; align-items: center; gap: 6px; white-space: nowrap; cursor: pointer; padding: 4px 8px; border-radius: 4px; transition: background 0.2s; }
        .legend-item:hover { background: #444; }
        .legend-item.hidden { opacity: 0.3; text-decoration: line-through; }
        .dot { width: 10px; height: 10px; border-radius: 2px; }
    </style>
</head>
<body>
    <div class="toolbar" style="justify-content: center;">
        <div class="legend" id="legend" style="border-bottom: none; background: transparent; padding: 0;"></div>
    </div>
    <canvas id="fieldCanvas"></canvas>
    <script>
        const vscode = acquireVsCodeApi();
        const canvas = document.getElementById('fieldCanvas');
        const ctx = canvas.getContext('2d');
        const legend = document.getElementById('legend');

        const fieldImage = new Image();
        fieldImage.src = "${imageUri}";
        fieldImage.onload = () => draw();

        let arrays = [];
        let dragging = null;
        let visibilityStates = {};

        let camera = { x: 348.8, y: -114.4, zoom: 1.828 };
        let isPanning = false;
        let lastMouse = { x: 0, y: 0 };

        const FIELD_WIDTH = 16.54;
        const FIELD_HEIGHT = 8.21;
        const ROBOT_SIZE = 1.0; 
        const COLORS = ['#0af', '#f0a', '#af0', '#f50', '#0fa', '#a0f', '#ff0', '#0ff'];
        const HIT_RADIUS = 15;

        window.addEventListener('message', event => {
            const m = event.data;
            if (m.command === 'setAllData') {
                if (m.focus) {
                    visibilityStates = {};
                    m.arrays.forEach(a => visibilityStates[a.name] = (a.name === m.focus));
                } else if (m.showAll) {
                    visibilityStates = {};
                    m.arrays.forEach(a => visibilityStates[a.name] = true);
                }

                arrays = m.arrays.map((a, i) => {
                    if (visibilityStates[a.name] === undefined) visibilityStates[a.name] = true;
                    return { ...a, color: COLORS[i % COLORS.length], visible: visibilityStates[a.name] };
                });
                updateLegend();
                draw();
            }
        });

        function updateLegend() {
            legend.innerHTML = arrays.map(a => 
                \`<div class="legend-item \${a.visible ? '' : 'hidden'}" onclick="toggleVisibility('\${a.name}')">
                    <div class="dot" style="background: \${a.color}"></div>\${a.name}
                </div>\`
            ).join('');
        }

        function toggleVisibility(name) {
            visibilityStates[name] = !visibilityStates[name];
            const a = arrays.find(arr => arr.name === name);
            if (a) a.visible = visibilityStates[name];
            updateLegend();
            draw();
        }

        function getDims() {
            const imgW = (fieldImage.complete && fieldImage.naturalWidth) ? fieldImage.naturalWidth : 1600;
            const imgH = (fieldImage.complete && fieldImage.naturalHeight) ? fieldImage.naturalHeight : 800;
            const baseScale = Math.min(canvas.width / imgW, canvas.height / imgH) || 1;
            const finalScale = baseScale * camera.zoom;
            const ox = (canvas.width / 2) + camera.x;
            const oy = (canvas.height / 2) + camera.y;
            const pxPerMeterX = (imgW - 200) / FIELD_WIDTH;
            const pxPerMeterY = (imgH - 200) / FIELD_HEIGHT;
            return { imgW, imgH, finalScale, ox, oy, pxPerMeterX, pxPerMeterY, baseScale };
        }

        function toScreen(x, y) {
            const { imgW, imgH, finalScale, ox, oy, pxPerMeterX, pxPerMeterY } = getDims();
            const imgCenterX = imgW / 2;
            const imgCenterY = imgH / 2;
            const fieldPxX = 100 + x * pxPerMeterX;
            const fieldPxY = (imgH - 100) - y * pxPerMeterY;
            return { 
                x: ox + (fieldPxX - imgCenterX) * finalScale, 
                y: oy + (fieldPxY - imgCenterY) * finalScale,
                scaleX: finalScale * pxPerMeterX,
                scaleY: finalScale * pxPerMeterY
            };
        }

        function fromScreen(sx, sy) {
            const { imgW, imgH, finalScale, ox, oy, pxPerMeterX, pxPerMeterY } = getDims();
            const imgCenterX = imgW / 2;
            const imgCenterY = imgH / 2;
            const fieldPxX = (sx - ox) / finalScale + imgCenterX;
            const fieldPxY = (sy - oy) / finalScale + imgCenterY;
            return { x: (fieldPxX - 100) / pxPerMeterX, y: (imgH - 100 - fieldPxY) / pxPerMeterY };
        }

        function findInteraction(sx, sy) {
            for (const a of arrays) {
                if (!a.visible) continue;
                for (let i = 0; i < a.points.length; i++) {
                    const p = a.points[i];
                    const s = toScreen(p.x, p.y);
                    const rad = p.heading * Math.PI / 180;
                    const hFieldX = p.x + Math.cos(rad) * 0.6;
                    const hFieldY = p.y + Math.sin(rad) * 0.6;
                    const hScreen = toScreen(hFieldX, hFieldY);
                    const dotRadius = Math.max(6, 6 * camera.zoom);
                    if (Math.hypot(hScreen.x - sx, hScreen.y - sy) < Math.max(HIT_RADIUS, dotRadius)) return { arrayName: a.name, index: i, type: 'rotate' };
                    if (Math.hypot(s.x - sx, s.y - sy) < HIT_RADIUS) return { arrayName: a.name, index: i, type: 'move' };
                }
            }
            return null;
        }

        function draw() {
            canvas.width = canvas.clientWidth;
            canvas.height = canvas.clientHeight;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const { imgW, imgH, finalScale, ox, oy } = getDims();
            const drawW = imgW * finalScale;
            const drawH = imgH * finalScale;
            if (fieldImage.complete && fieldImage.naturalWidth) {
                ctx.drawImage(fieldImage, ox - drawW/2, oy - drawH/2, drawW, drawH);
            } else {
                ctx.fillStyle = '#111';
                ctx.fillRect(ox - drawW/2, oy - drawH/2, drawW, drawH);
            }
            arrays.forEach(a => {
                if (!a.visible) return;
                ctx.strokeStyle = a.color;
                ctx.lineWidth = 3;
                ctx.globalAlpha = 0.4;
                ctx.beginPath();
                a.points.forEach((p, i) => {
                    const s = toScreen(p.x, p.y);
                    if(i===0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
                });
                ctx.stroke();
                ctx.globalAlpha = 1.0;
                a.points.forEach((p, i) => {
                    const s = toScreen(p.x, p.y);
                    const isDragging = dragging && dragging.arrayName === a.name && dragging.index === i;
                    ctx.save();
                    ctx.translate(s.x, s.y);
                    ctx.rotate(-p.heading * Math.PI / 180);
                    const bW = s.scaleX * ROBOT_SIZE;
                    const bH = s.scaleY * ROBOT_SIZE;
                    ctx.strokeStyle = isDragging ? 'white' : a.color;
                    ctx.lineWidth = 2;
                    ctx.strokeRect(-bW/2, -bH/2, bW, bH);
                    ctx.fillStyle = 'rgba(255,255,255,0.15)';
                    ctx.fillRect(0, -bH/2, bW/2, bH);
                    ctx.restore();
                    const rad = p.heading * Math.PI / 180;
                    const hScreen = toScreen(p.x + Math.cos(rad)*0.6, p.y + Math.sin(rad)*0.6);
                    const handleRadius = Math.max(6, 6 * camera.zoom);
                    ctx.fillStyle = (isDragging && dragging.type === 'rotate') ? '#ff0' : '#fff';
                    ctx.beginPath(); ctx.arc(hScreen.x, hScreen.y, handleRadius, 0, 7); ctx.fill();
                    ctx.strokeStyle = 'black'; ctx.lineWidth = 1; ctx.stroke();
                    ctx.fillStyle = (isDragging && dragging.type === 'move') ? '#ff0' : a.color;
                    ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, 7); ctx.fill();
                    if (i === 0) {
                        ctx.fillStyle = 'white'; ctx.font = 'bold 12px sans-serif';
                        ctx.shadowColor = 'black'; ctx.shadowBlur = 4;
                        ctx.textAlign = 'left';
                        ctx.fillText(a.name, s.x + bW/2 + 5, s.y - bH/2);
                        ctx.shadowBlur = 0;
                    }
                });
            });
        }

        function getMousePos(e) {
            const rect = canvas.getBoundingClientRect();
            return { x: e.clientX - rect.left, y: e.clientY - rect.top };
        }

        canvas.onmousedown = e => { 
            const m = getMousePos(e);
            if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
                isPanning = true;
                lastMouse = m;
            } else {
                dragging = findInteraction(m.x, m.y); 
            }
            draw(); 
        };

        window.onmousemove = e => {
            const m = getMousePos(e);
            if (isPanning) {
                camera.x += m.x - lastMouse.x;
                camera.y += m.y - lastMouse.y;
                lastMouse = m;
                draw();
            } else if (dragging) {
                const a = arrays.find(arr => arr.name === dragging.arrayName);
                const p = a.points[dragging.index];
                if (dragging.type === 'move') {
                    const pos = fromScreen(m.x, m.y);
                    p.x = pos.x; p.y = pos.y;
                } else if (dragging.type === 'rotate') {
                    const s = toScreen(p.x, p.y);
                    p.heading = -Math.atan2(m.y - s.y, m.x - s.x) * 180 / Math.PI;
                }
                draw();
            } else {
                const interact = findInteraction(m.x, m.y);
                canvas.style.cursor = interact ? 'pointer' : (e.shiftKey ? 'grab' : 'crosshair');
            }
        };

        window.onmouseup = () => {
            if (isPanning) isPanning = false;
            if (dragging) {
                const a = arrays.find(arr => arr.name === dragging.arrayName);
                const p = a.points[dragging.index];
                vscode.postMessage({ command: 'updatePose', arrayName: dragging.arrayName, index: dragging.index, x: p.x, y: p.y, heading: p.heading });
                dragging = null;
            }
            draw();
        };

        window.addEventListener('wheel', e => {
            const m = getMousePos(e);
            const factor = Math.pow(1.1, -e.deltaY / 100);
            const oldZoom = camera.zoom;
            camera.zoom *= factor;
            camera.zoom = Math.max(0.1, Math.min(10, camera.zoom));
            const actualFactor = camera.zoom / oldZoom;
            camera.x = m.x - (m.x - camera.x) * actualFactor;
            camera.y = m.y - (m.y - camera.y) * actualFactor;
            draw();
            e.preventDefault();
        }, { passive: false });

        window.onresize = draw;
        vscode.postMessage({ command: 'ready' });
    </script>
</body>
</html>`;
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
