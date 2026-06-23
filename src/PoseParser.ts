import * as vscode from 'vscode';
import { logChannel } from './extension';

export interface PosePoint {
    x: number;
    y: number;
    heading: number; // ALWAYS degrees for the visualizer
    isRadians: boolean; // Whether the source heading literal is in radians
    headingWritable: boolean; // False for Rotation2d.k* static constants
    xRange: vscode.Range;
    yRange: vscode.Range;
    hRange: vscode.Range;
}

// WPILib Rotation2d static constants — render-only (no drag-rotate write-back).
const STATIC_ROTATIONS: Record<string, number> = {
    'kZero': 0,
    'kCW_Pi_2': -90,
    'kCW_90deg': -90,
    'kCCW_Pi_2': 90,
    'kCCW_90deg': 90,
    'kPi': 180,
    'k180deg': 180,
};

// Groups: 1=x, 2=y, 3=static-constant ref (e.g. "Rotation2d.kZero"),
// 4=outer rotation wrapper, 5=inner scalar converter, 6=heading literal.
// Either group 3 is set (static branch) or group 6 is set (dynamic branch).
const POSE_REGEX_SRC = /(?:new\s+Pose2d|p)\s*\(\s*([^,\s)]+)\s*,\s*([^,\s)]+)\s*,\s*(?:(Rotation2d\.k(?:Zero|CW_Pi_2|CW_90deg|CCW_Pi_2|CCW_90deg|Pi|180deg))|(?:(Rotation2d\.fromDegrees|new\s+Rotation2d|Rotation2d\.fromRadians)\s*\(\s*)?(?:(Math\.toRadians|Math\.toDegrees|Units\.degreesToRadians|Units\.radiansToDegrees)\s*\(\s*)?([^,\s)]+))/.source;

function parseLiteral(s: string): number {
    return parseFloat(s.replace(/[df]$/i, '').replace(/_/g, ''));
}

function literalIsRadians(outer: string, inner: string): boolean {
    if (inner === 'Math.toRadians' || inner === 'Units.degreesToRadians') return false;
    if (inner === 'Math.toDegrees' || inner === 'Units.radiansToDegrees') return true;
    return outer === 'Rotation2d.fromRadians' || /^new\s+Rotation2d$/.test(outer);
}

export class PoseParser {
    public static parse(content: string, contentOffset: number, document: vscode.TextDocument): PosePoint[] {
        const points: PosePoint[] = [];
        const regex = new RegExp(POSE_REGEX_SRC, 'gd');

        let match: RegExpExecArray | null;
        while ((match = regex.exec(content)) !== null) {
            if (!match.indices) continue;

            const xLit = match[1];
            const yLit = match[2];
            const staticRef = match[3];
            const outer = match[4] || '';
            const inner = match[5] || '';
            const hLit = match[6];

            const x = parseLiteral(xLit);
            const y = parseLiteral(yLit);
            if (isNaN(x) || isNaN(y)) {
                logChannel?.appendLine(`WarPath: skipped pose with non-numeric x/y — "${match[0]}"`);
                continue;
            }

            const xIdx = match.indices[1]!;
            const yIdx = match.indices[2]!;

            let heading: number;
            let isRadians: boolean;
            let headingWritable: boolean;
            let hIdx: [number, number];

            if (staticRef !== undefined) {
                const suffix = staticRef.slice('Rotation2d.'.length);
                heading = STATIC_ROTATIONS[suffix];
                isRadians = false;
                headingWritable = false;
                hIdx = match.indices[3]!;
            } else {
                const headingRaw = parseLiteral(hLit);
                if (isNaN(headingRaw)) {
                    logChannel?.appendLine(`WarPath: skipped pose with non-numeric heading — "${match[0]}"`);
                    continue;
                }
                isRadians = literalIsRadians(outer, inner);
                heading = isRadians ? (headingRaw * 180 / Math.PI) : headingRaw;
                headingWritable = true;
                hIdx = match.indices[6]!;
            }

            points.push({
                x, y,
                heading,
                isRadians,
                headingWritable,
                xRange: new vscode.Range(
                    document.positionAt(contentOffset + xIdx[0]),
                    document.positionAt(contentOffset + xIdx[1])),
                yRange: new vscode.Range(
                    document.positionAt(contentOffset + yIdx[0]),
                    document.positionAt(contentOffset + yIdx[1])),
                hRange: new vscode.Range(
                    document.positionAt(contentOffset + hIdx[0]),
                    document.positionAt(contentOffset + hIdx[1])),
            });
        }

        return points;
    }
}
