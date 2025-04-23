import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export async function getYtDlpAudioUrl(query: string): Promise<string | null> {
    return new Promise((resolve) => {
        // 프로젝트 루트의 yt-dlp 폴더에 yt-dlp(.exe)가 있으면 우선 사용
        const rootDir = path.resolve(__dirname, '../../');
        let ytdlpPath = 'yt-dlp';
        const ytDlpFolder = path.join(rootDir, 'yt-dlp');
        if (process.platform === 'win32') {
            const exePath = path.join(ytDlpFolder, 'yt-dlp.exe');
            if (fs.existsSync(exePath)) {
                ytdlpPath = exePath;
            }
        } else {
            const binPath = path.join(ytDlpFolder, 'yt-dlp');
            if (fs.existsSync(binPath)) {
                ytdlpPath = binPath;
            }
        }
        const args = [
            '-f', 'bestaudio',
            '--no-playlist',
            '--default-search', 'ytsearch',
            '--skip-download',
            '--print', 'url',
            query
        ];
        const proc = spawn(ytdlpPath, args, { shell: true });
        let url = '';
        proc.stdout.on('data', (data) => {
            url += data.toString();
        });
        proc.stderr.on('data', () => {}); // 무시
        proc.on('close', (code) => {
            if (code === 0 && url.trim().length > 0) {
                resolve(url.trim().split('\n')[0]);
            } else {
                resolve(null);
            }
        });
    });
}
