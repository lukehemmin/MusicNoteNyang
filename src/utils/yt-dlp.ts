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
function getCacheKey(query: string, seekTime: number = 0): string {
    // seekTime에 따라 다른 캐시 키 생성 (동일 영상의 다른 위치)
    return crypto.createHash('md5').update(`${query}_seek_${seekTime}`).digest('hex');
}

// 캐시에서 URL 가져오기
function getCachedUrl(query: string, seekTime: number = 0): string | null {
    try {
        const cacheKey = getCacheKey(query, seekTime);
        const cachePath = path.join(CACHE_DIR, cacheKey);
        
        if (fs.existsSync(cachePath)) {
            const stats = fs.statSync(cachePath);
            const fileAge = Date.now() - stats.mtimeMs;
            
            // 캐시가 유효한 경우
            if (fileAge < CACHE_EXPIRY) {
                const cachedData = fs.readFileSync(cachePath, 'utf8');
                console.log(`[yt-dlp 캐시] 캐시에서 URL 로드: ${query} (시작 위치: ${seekTime}초)`);
                return cachedData;
            }
        }
    } catch (err) {
        console.error('[yt-dlp 캐시] 캐시 읽기 오류:', err);
    }
    
    return null;
}

// URL을 캐시에 저장
function cacheUrl(query: string, url: string, seekTime: number = 0): void {
    try {
        const cacheKey = getCacheKey(query, seekTime);
        const cachePath = path.join(CACHE_DIR, cacheKey);
        fs.writeFileSync(cachePath, url);
        console.log(`[yt-dlp 캐시] URL 캐싱 완료: ${query} (시작 위치: ${seekTime}초)`);
    } catch (err) {
        console.error('[yt-dlp 캐시] 캐시 저장 오류:', err);
    }
}

// 추출된 URL에 시간 매개변수 추가 (직접 스트림 URL 수정)
function appendSeekTimeToStreamUrl(url: string, seekTime: number): string {
    if (seekTime <= 0) return url;
    
    try {
        // URL 파싱
        const parsedUrl = new URL(url);
        
        // 영상 스트리밍 URL에 시작 시간 매개변수 추가
        if (!parsedUrl.searchParams.has('begin')) {
            parsedUrl.searchParams.set('begin', (seekTime * 1000).toString()); // 밀리초 단위로 변환
            console.log(`[yt-dlp] 스트리밍 URL에 시작 시간 매개변수 추가: begin=${seekTime * 1000}`);
        }
        
        return parsedUrl.toString();
    } catch (err) {
        console.error('[yt-dlp] 스트리밍 URL 수정 오류:', err);
        return url; // 오류 발생 시 원본 URL 반환
    }
}

export async function getYtDlpAudioUrl(query: string, seekTime: number = 0): Promise<string | null> {
    // 1. 캐시에서 확인
    const cachedUrl = getCachedUrl(query, seekTime);
    if (cachedUrl) {
        return cachedUrl;
    }
    
    // 직접 URL에 시간 파라미터 추가 (YouTube URL인 경우만)
    // 예: 'https://www.youtube.com/watch?v=VIDEO_ID&t=300' (5분 시작 지점)
    const originalQuery = query;
    if (isUrl(query) && seekTime > 0 && (query.includes('youtube.com') || query.includes('youtu.be'))) {
        try {
            const url = new URL(query);
            
            // 기존 t 파라미터가 있으면 제거
            url.searchParams.delete('t');
            
            // 새 시간 파라미터 추가
            url.searchParams.set('t', seekTime.toString());
            
            // 수정된 URL 사용
            query = url.toString();
            console.log(`[yt-dlp] 시간 파라미터가 포함된 URL로 변경: ${query}`);
        } catch (err) {
            console.error('[yt-dlp] URL 파싱 오류:', err);
        }
    }
    
    // 2. 캐시에 없으면 yt-dlp 실행 (최대 3회 재시도)
    const maxRetries = 3;
    let currentRetry = 0;
    
    // 재시도 함수
    const tryGetUrl = async (): Promise<string | null> => {
        if (currentRetry >= maxRetries) {
            console.error(`[yt-dlp] 최대 재시도 횟수(${maxRetries}회) 초과. URL 가져오기 실패: ${query}`);
            return null;
        }
        
        currentRetry++;
        console.log(`[yt-dlp] URL 가져오기 시도 ${currentRetry}/${maxRetries}: ${query}`);
        
        return new Promise((resolve, reject) => {
            let url = '';
            let errorLog = '';
            const args = [
                '-f', 'bestaudio',
                '--no-playlist',
                '--get-url',
                '--socket-timeout', '30',      // 소켓 타임아웃 설정 (10초에서 30초로 증가)
                '--retries', '3',              // yt-dlp 내부 재시도 횟수 증가
                '--no-check-certificates',     // 인증서 검사 건너뛰기
                '--ignore-errors',             // 오류 무시하고 계속 진행
                '--no-warnings',               // 경고 메시지 출력 안 함
                '--no-progress'                // 진행 표시줄 숨기기
            ];
            
            // NOTE: --downloader-args는 --get-url 모드에서 작동하지 않기 때문에 제거
            // 대신 추출된 URL에 직접 시간 매개변수를 추가할 것임
            
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
                    let finalUrl = url.trim().split('\n')[0];
                    console.log(`[yt-dlp] 추출된 URL: ${finalUrl}`);
                    
                    // 추출된 URL에 시간 매개변수 직접 추가
                    if (seekTime > 0) {
                        finalUrl = appendSeekTimeToStreamUrl(finalUrl, seekTime);
                        console.log(`[yt-dlp] 시간 매개변수가 추가된 최종 URL: ${finalUrl}`);
                    }
                    
                    // 캐시에 저장
                    cacheUrl(originalQuery, finalUrl, seekTime);
                    resolve(finalUrl);
                } else {
                    console.error(`[yt-dlp] 오디오 URL 추출 실패. query: ${query}, code: ${code}, stderr: ${errorLog}`);
                    // 실패 시 다시 시도
                    resolve(null);
                }
            });
            proc.on('error', (err: Error) => {
                console.error(`[yt-dlp] 오류 발생: ${err.message}`);
                // 실패 시 다시 시도
                resolve(null);
            });
            
            // 시간 초과 처리 (30초로 증가)
            const timeout = setTimeout(() => {
                console.log(`[yt-dlp] 시간 초과 - 프로세스 종료: ${query}`);
                proc.kill();
                resolve(null);
            }, 30000);
            
            proc.on('close', () => {
                clearTimeout(timeout);
            });
        });
    };
    
    // 실행 및 재시도 로직
    while (currentRetry < maxRetries) {
        const result = await tryGetUrl();
        if (result) return result;
        
        // 재시도 전에 잠시 대기 (1초씩 증가)
        const waitTime = 1000 * currentRetry;
        console.log(`[yt-dlp] ${waitTime/1000}초 후 재시도 예정...`);
        await new Promise(r => setTimeout(r, waitTime));
    }
    
    return null;
}
