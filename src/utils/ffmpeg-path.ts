import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';

/**
 * 프로젝트 루트의 ffmpeg/bin/ffmpeg(.exe) 경로를 반환
 * 없으면 시스템 경로(/usr/bin/ffmpeg 등)를 반환, 둘 다 없으면 null 반환
 */
export function getCustomFfmpegPath(): string | null {
    const rootDir = path.resolve(__dirname, '../../');
    const binDir = path.join(rootDir, 'ffmpeg', 'bin');
    let exe = 'ffmpeg';
    if (process.platform === 'win32') exe = 'ffmpeg.exe';
    const ffmpegPath = path.join(binDir, exe);
    if (fs.existsSync(ffmpegPath)) return ffmpegPath;
    // 시스템 경로에서 ffmpeg 탐색
    try {
        const sysPath = execSync('which ffmpeg').toString().trim();
        if (fs.existsSync(sysPath)) return sysPath;
    } catch {}
    return null;
}
