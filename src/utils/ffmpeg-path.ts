import * as path from 'path';
import * as fs from 'fs';

/**
 * 프로젝트 루트의 ffmpeg/bin/ffmpeg(.exe) 경로를 반환
 * 없으면 null 반환
 */
export function getCustomFfmpegPath(): string | null {
    const rootDir = path.resolve(__dirname, '../../');
    const binDir = path.join(rootDir, 'ffmpeg', 'bin');
    let exe = 'ffmpeg';
    if (process.platform === 'win32') exe = 'ffmpeg.exe';
    const ffmpegPath = path.join(binDir, exe);
    if (fs.existsSync(ffmpegPath)) return ffmpegPath;
    return null;
}
