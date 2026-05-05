import * as vscode from 'vscode';
import { logChannel } from './extension';

export interface PosePoint {
    x: number;
    y: number;
    heading: number; // ALWAYS degrees for the visualizer
    isRadians: boolean; // Tracking if the source was radians
    xRange: vscode.Range;
    yRange: vscode.Range;
    hRange: vscode.Range;
}

export class PoseParser {
    public static parse(content: string, contentOffset: number, document: vscode.TextDocument): PosePoint[] {
        const points: PosePoint[] = [];
        
        // Group 1: x, Group 2: y, Group 3: rotation function name (optional), Group 4: heading value
        const poseRegex = /(?:new\s+Pose2d|p)\s*\(\s*([^,\s)]+)\s*,\s*([^,\s)]+)\s*,\s*(?:(Rotation2d\.fromDegrees|new\s+Rotation2d|Rotation2d\.fromRadians)\s*\(\s*)?([^,\s)]+)/g;
        
        let match;
        while ((match = poseRegex.exec(content)) !== null) {
            const xStr = match[1];
            const yStr = match[2];
            const rotFunc = match[3] || "";
            const hStr = match[4];
            
            const x = parseFloat(xStr.replace(/[df]$/i, ''));
            const y = parseFloat(yStr.replace(/[df]$/i, ''));
            let heading = parseFloat(hStr.replace(/[df]$/i, ''));
            
            if (isNaN(x) || isNaN(y) || isNaN(heading)) continue;

            const isRadians = rotFunc.includes('Radians') || rotFunc === 'new Rotation2d';
            
            // Visualizer always works in degrees
            const visualHeading = isRadians ? (heading * 180 / Math.PI) : heading;

            const matchIndexInContent = match.index;
            
            const xIdxInMatch = match[0].indexOf(xStr);
            const xOffset = contentOffset + matchIndexInContent + xIdxInMatch;
            
            const yIdxInMatch = match[0].indexOf(yStr, xIdxInMatch + xStr.length);
            const yOffset = contentOffset + matchIndexInContent + yIdxInMatch;
            
            const hIdxInMatch = match[0].indexOf(hStr, yIdxInMatch + yStr.length);
            const hOffset = contentOffset + matchIndexInContent + hIdxInMatch;
            
            points.push({
                x, y, 
                heading: visualHeading,
                isRadians,
                xRange: new vscode.Range(document.positionAt(xOffset), document.positionAt(xOffset + xStr.length)),
                yRange: new vscode.Range(document.positionAt(yOffset), document.positionAt(yOffset + yStr.length)),
                hRange: new vscode.Range(document.positionAt(hOffset), document.positionAt(hOffset + hStr.length))
            });
        }
        
        return points;
    }
}
