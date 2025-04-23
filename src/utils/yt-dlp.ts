import YTDlpWrap from 'yt-dlp-wrap';

const ytdlpWrap = new YTDlpWrap('C:/Users/Administrator/Documents/GitHub/MusicNoteNyang/yt-dlp/yt-dlp.exe');

// YTDlpWrap의 타입 정의상 stdout 이벤트는 지원하지 않지만, 실제로는 Node.js EventEmitter로 동작하므로 as any로 우회
export async function getYtDlpAudioUrl(query: string): Promise<string | null> {
    return new Promise((resolve) => {
        let url = '';
        const process = ytdlpWrap.exec([
            '-f', 'bestaudio',
            '--no-playlist',
            '--default-search', 'ytsearch',
            '--skip-download',
            '--print', 'url',
            query
        ]);
        (process as any).on('stdout', (data: Buffer) => {
            url += data.toString();
        });
        process.on('close', (code: number | null) => {
            if (code === 0 && url.trim().length > 0) {
                resolve(url.trim().split('/n')[0]);
            } else {
                resolve(null);
            }
        });
    });
}
