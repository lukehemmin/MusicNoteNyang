import { spawn } from 'child_process';

function isUrl(str: string): boolean {
    try {
        new URL(str);
        return true;
    } catch {
        return false;
    }
}

export async function getYtDlpAudioUrl(query: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
        let url = '';
        let errorLog = '';
        const args = [
            '-f', 'bestaudio',
            '--no-playlist',
            '--get-url'
        ];
        if (!isUrl(query)) {
            args.push('--default-search', 'ytsearch');
        }
        args.push(query);
        console.log(`[yt-dlp] 직접 실행: yt-dlp ${args.join(' ')}`);
        const proc = spawn('yt-dlp', args);
        proc.stdout.on('data', (data: Buffer) => {
            url += data.toString();
        });
        proc.stderr.on('data', (data: Buffer) => {
            errorLog += data.toString();
        });
        proc.on('close', (code: number) => {
            console.log(`[yt-dlp] 종료 코드: ${code}`);
            if (url.trim().length > 0) {
                console.log(`[yt-dlp] 추출된 URL: ${url.trim().split('\n')[0]}`);
                resolve(url.trim().split('\n')[0]);
            } else {
                console.error(`[yt-dlp] 오디오 URL 추출 실패. query: ${query}, code: ${code}, stderr: ${errorLog}`);
                resolve(null);
            }
        });
        proc.on('error', (err: Error) => {
            console.error(`[yt-dlp] 오류 발생: ${err.message}`);
            reject(err);
        });
    });
}
