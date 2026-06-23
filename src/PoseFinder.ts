export interface PoseArrayMatch {
    name: string;
    content: string;
    contentOffset: number;
}

const BRACE_REGEX = /(?:Pose2d\[\]|List<Pose2d>)\s+(\w+)\s*=\s*\{([\s\S]*?)\}/g;
const LIST_OF_REGEX = /(?:Pose2d\[\]|List<Pose2d>)\s+(\w+)\s*=\s*List\.of\(([\s\S]*?)\)/g;
const SINGLE_REGEX = /Pose2d\s+(\w+)\s*=\s*([^;]+);/g;

export function findPoseArrays(text: string): PoseArrayMatch[] {
    const results: PoseArrayMatch[] = [];
    for (const regex of [BRACE_REGEX, LIST_OF_REGEX, SINGLE_REGEX]) {
        regex.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(text)) !== null) {
            const name = match[1];
            const content = match[2];
            const contentOffset = match.index + match[0].indexOf(content);
            results.push({ name, content, contentOffset });
        }
    }
    return results;
}

export function findPoseArrayByName(text: string, name: string): PoseArrayMatch | undefined {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
        new RegExp(`(?:Pose2d\\[\\]|List<Pose2d>)\\s+${escaped}\\s*=\\s*\\{([\\s\\S]*?)\\}`),
        new RegExp(`(?:Pose2d\\[\\]|List<Pose2d>)\\s+${escaped}\\s*=\\s*List\\.of\\(([\\s\\S]*?)\\)`),
        new RegExp(`Pose2d\\s+${escaped}\\s*=\\s*([^;]+);`),
    ];
    for (const regex of patterns) {
        const match = regex.exec(text);
        if (match) {
            const content = match[1];
            const contentOffset = match.index + match[0].indexOf(content);
            return { name, content, contentOffset };
        }
    }
    return undefined;
}
