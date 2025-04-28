import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// 캐시 디렉토리 생성
const CACHE_DIR = path.join(__dirname, '../../.cache/yt-dlp');
if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// 캐시 만료 시간: 1시간 (ms)
const CACHE_EXPIRY = 60 * 60 * 1000;

// 주기적으로 오래된 캐시 정리 (1시간마다)
setInterval(() => {
    cleanOldCache();
}, CACHE_EXPIRY);

// 오래된 캐시 파일 정리
function cleanOldCache() {
    try {
        const now = Date.now();
        const files = fs.readdirSync(CACHE_DIR);
        
        for (const file of files) {
            const filePath = path.join(CACHE_DIR, file);
            const stats = fs.statSync(filePath);
            const fileAge = now - stats.mtimeMs;
            
            if (fileAge > CACHE_EXPIRY) {
                fs.unlinkSync(filePath);
                console.log(`[yt-dlp 캐시] 만료된 캐시 삭제: ${file}`);
            }
        }
    } catch (err) {
        console.error('[yt-dlp 캐시] 캐시 정리 중 오류:', err);
    }
}

function isUrl(str: string): boolean {
    try {
        new URL(str);
        return true;
    } catch {
        return false;
    }
}

// 쿼리에 대한 캐시 키 생성
function getCacheKey(query: string): string {
    return crypto.createHash('md5').update(query).digest('hex');
}

// 캐시에서 URL 가져오기
function getCachedUrl(query: string): string | null {
    try {
        const cacheKey = getCacheKey(query);
        const cachePath = path.join(CACHE_DIR, cacheKey);
        
        if (fs.existsSync(cachePath)) {
            const stats = fs.statSync(cachePath);
            const fileAge = Date.now() - stats.mtimeMs;
            
            // 캐시가 유효한 경우
            if (fileAge < CACHE_EXPIRY) {
                const cachedData = fs.readFileSync(cachePath, 'utf8');
                console.log(`[yt-dlp 캐시] 캐시에서 URL 로드: ${query}`);
                return cachedData;
            }
        }
    } catch (err) {
        console.error('[yt-dlp 캐시] 캐시 읽기 오류:', err);
    }
    
    return null;
}

// URL을 캐시에 저장
function cacheUrl(query: string, url: string): void {
    try {
        const cacheKey = getCacheKey(query);
        const cachePath = path.join(CACHE_DIR, cacheKey);
        fs.writeFileSync(cachePath, url);
        console.log(`[yt-dlp 캐시] URL 캐싱 완료: ${query}`);
    } catch (err) {
        console.error('[yt-dlp 캐시] 캐시 저장 오류:', err);
    }
}

export async function getYtDlpAudioUrl(query: string): Promise<string | null> {
    // 1. 캐시에서 확인
    const cachedUrl = getCachedUrl(query);
    if (cachedUrl) {
        return cachedUrl;
    }
    
    // 2. 캐시에 없으면 yt-dlp 실행
    return new Promise((resolve, reject) => {
        let url = '';
        let errorLog = '';
        const args = [
            '-f', 'bestaudio',
            '--no-playlist',
            '--get-url',
            '--socket-timeout', '10',      // 소켓 타임아웃 설정
            '--retries', '1',              // 재시도 횟수 제한
            '--no-check-certificates',     // 인증서 검사 건너뛰기
            '--ignore-errors',             // 오류 무시하고 계속 진행
            '--no-warnings',               // 경고 메시지 출력 안 함
            '--no-progress'                // 진행 표시줄 숨기기
        ];
        if (!isUrl(query)) {
            args.push('--default-search', 'ytsearch');
            args.push('--max-downloads', '1'); // 검색 결과 제한
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
                const finalUrl = url.trim().split('\n')[0];
                console.log(`[yt-dlp] 추출된 URL: ${finalUrl}`);
                // 캐시에 저장
                cacheUrl(query, finalUrl);
                resolve(finalUrl);
            } else {
                console.error(`[yt-dlp] 오디오 URL 추출 실패. query: ${query}, code: ${code}, stderr: ${errorLog}`);
                resolve(null);
            }
        });
        proc.on('error', (err: Error) => {
            console.error(`[yt-dlp] 오류 발생: ${err.message}`);
            reject(err);
        });
        
        // 시간 초과 처리 (15초)
        const timeout = setTimeout(() => {
            console.log(`[yt-dlp] 시간 초과 - 프로세스 종료: ${query}`);
            proc.kill();
            resolve(null);
        }, 15000);
        
        proc.on('close', () => {
            clearTimeout(timeout);
        });
    });
}
