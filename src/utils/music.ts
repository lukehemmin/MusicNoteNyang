import { CommandInteraction, ButtonInteraction, Interaction, User } from 'discord.js';
import { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, getVoiceConnection } from '@discordjs/voice';
import { saveMusicHistory } from '../db/musicHistory.repository';
import { getGuildVolume } from '../db/volume.repository';
import { saveResumeState, clearResumeState } from '../db/resumeState.repository';
import { autoUpdateMusicStatusEmbed } from '../handlers/musicStatusEmbed';

// Lavalink 트랙 타입 정의
export interface LavalinkTrackInfo {
    title: string;
    author: string;
    length: number;
    identifier: string;
    uri?: string;
    isStream?: boolean;
    isSeekable?: boolean;
    sourceName?: string;
}

export interface LavalinkTrack {
    track: string; // base64
    info: LavalinkTrackInfo;
}

export interface QueueItem {
    track: LavalinkTrack | { title: string; query?: string; info?: Partial<LavalinkTrackInfo> };
    requestedBy: string;
    seek?: number;
    audioResource?: any;
    audioPlayer?: any;
    pending?: boolean;
    historyId?: number;
}

export interface PendingProcess {
    ytDlpProc?: import('child_process').ChildProcess;
    ffmpegProc?: import('child_process').ChildProcess;
    startedAt?: number;
    status?: 'pending' | 'running' | 'ended' | 'aborted';
}

export class MusicUtils {
    private static queues: Map<string, QueueItem[]> = new Map();
    private static nowPlaying: Map<string, QueueItem | null> = new Map();
    private static pendingProcesses: Map<string, PendingProcess> = new Map();
    private static queueLocks: Map<string, Promise<void>> = new Map();

    public static abortPendingProcess(guildId: string) {
        const procObj = MusicUtils.pendingProcesses.get(guildId);
        if (procObj) {
            if (procObj.ytDlpProc && !procObj.ytDlpProc.killed) {
                try { procObj.ytDlpProc.kill('SIGKILL'); } catch {}
            }
            if (procObj.ffmpegProc && !procObj.ffmpegProc.killed) {
                try { procObj.ffmpegProc.kill('SIGKILL'); } catch {}
            }
            MusicUtils.pendingProcesses.delete(guildId);
        }
    }

    public static async searchTracks(query: string): Promise<LavalinkTrack[]> {
        const LAVALINK_HOST = process.env.LAVALINK_HOST!;
        const LAVALINK_PORT = process.env.LAVALINK_PORT!;
        const LAVALINK_PASSWORD = process.env.LAVALINK_PASSWORD!;
        const params = new URLSearchParams({
            identifier: query.startsWith('http') ? query : `ytsearch:${query}`
        });
        const url = `http://${LAVALINK_HOST}:${LAVALINK_PORT}/v4/loadtracks?${params.toString()}`;
        const res = await fetch(url, { headers: { Authorization: LAVALINK_PASSWORD } });
        const data = await res.json();
        if (!data.tracks || data.tracks.length === 0) return [];
        return data.tracks as LavalinkTrack[];
    }

    public static async withQueueLock(guildId: string, fn: () => Promise<void>) {
        const prevLock = MusicUtils.queueLocks.get(guildId) || Promise.resolve();
        let release: () => void;
        const lock = new Promise<void>(resolve => { release = resolve; });
        MusicUtils.queueLocks.set(guildId, prevLock.then(() => lock));
        try {
            await prevLock;
            await fn();
        } finally {
            release!();
            // 락 해제
            if (MusicUtils.queueLocks.get(guildId) === lock) {
                MusicUtils.queueLocks.delete(guildId);
            }
        }
    }

    public static async enqueue(guildId: string, item: QueueItem) {
        if (!MusicUtils.queues.has(guildId)) MusicUtils.queues.set(guildId, []);
        MusicUtils.queues.get(guildId)!.push(item);
        console.log(`[enqueue] ${guildId} 큐 추가:`, item);
    }

    public static async dequeue(guildId: string): Promise<QueueItem | null> {
        const queue = MusicUtils.queues.get(guildId) || [];
        const item = queue.shift() || null;
        console.log(`[dequeue] ${guildId} 큐 pop:`, item);
        MusicUtils.queues.set(guildId, queue);
        return item;
    }

    public static async playNext(guildId: string, voiceChannelId: string, interaction: CommandInteraction | ButtonInteraction | null, client?: any) {
        await MusicUtils.withQueueLock(guildId, async () => {
            const queue = MusicUtils.queues.get(guildId) || [];
            if (!queue.length) {
                MusicUtils.nowPlaying.set(guildId, null);
                if (interaction) await safeReply(interaction, '대기열이 비었습니다.');
                if (client) await autoUpdateMusicStatusEmbed(client, guildId);
                return;
            }
            const item = queue.shift()!;
            MusicUtils.nowPlaying.set(guildId, item);
            MusicUtils.queues.set(guildId, queue);
            if (!client) return;
            let player = client.lavalink.players.get(guildId);
            if (!player) {
                player = client.lavalink.create({
                    guildId,
                    voiceId: voiceChannelId,
                    textId: interaction ? interaction.channelId : undefined
                });
                player.connect();
            }
            player.play(item.track);
            player.once('start', async () => {
                if (interaction) await safeReply(interaction, `재생 중: **${MusicUtils.getTrackTitle(item.track)}**`);
                await autoUpdateMusicStatusEmbed(client, guildId);
            });
            player.once('end', async () => {
                await MusicUtils.playNext(guildId, voiceChannelId, null, client);
                await autoUpdateMusicStatusEmbed(client, guildId);
            });
        });
    }

    public static async playNextYtDlp(guildId: string, voiceChannel: any, interaction: CommandInteraction | ButtonInteraction | null, client?: any) {
        const queue = await MusicUtils.dequeue(guildId);
        console.log(`[playNextYtDlp] queue:`, queue);
        if (!queue) {
            MusicUtils.nowPlaying.set(guildId, null);
            await clearResumeState(guildId);
            if (interaction) await safeReply(interaction, '대기열이 없어 음성방에서 나갑니다.');
            const connection = getVoiceConnection(guildId);
            if (connection) connection.destroy();
            if (client) await autoUpdateMusicStatusEmbed(client, guildId);
            return;
        }
        MusicUtils.nowPlaying.set(guildId, { ...queue, pending: true });
        
        // 기존 실행 중인 프로세스 종료
        MusicUtils.abortPendingProcess(guildId);
        
        try {
            // yt-dlp를 통해 오디오 URL 추출
            const { getYtDlpAudioUrl } = await import('./yt-dlp');
            const query = 'query' in queue.track ? queue.track.query! : MusicUtils.getTrackUrl(queue.track);
            const audioUrl = await getYtDlpAudioUrl(query);
            
            if (!audioUrl) {
                if (interaction) await safeReply(interaction, '음악을 찾을 수 없습니다.');
                // 다음 곡 재생 시도
                await MusicUtils.playNextYtDlp(guildId, voiceChannel, interaction, client);
                return;
            }
            
            // 음성 채널 연결
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId,
                adapterCreator: voiceChannel.guild.voiceAdapterCreator,
            });
            
            // 오디오 플레이어 생성
            const player = createAudioPlayer();
            connection.subscribe(player);
            
            // 오디오 리소스 생성
            const resource = createAudioResource(audioUrl);
            
            // 볼륨 설정 (선택적)
            const volume = await getGuildVolume(guildId);
            if (volume && resource.volume) {
                resource.volume.setVolume(volume / 100);
            }
            
            // 현재 재생 중인 항목 업데이트
            MusicUtils.nowPlaying.set(guildId, {
                ...queue,
                pending: false,
                audioPlayer: player,
                audioResource: resource
            });
            
            // 음악 재생 시작
            player.play(resource);
            
            // 음악 재생 상태 기록
            await saveResumeState({
                guildId,
                voiceChannelId: voiceChannel.id,
                textChannelId: interaction ? interaction.channelId : '',
                trackUrl: query,
                title: MusicUtils.getTrackTitle(queue.track),
                requestedBy: queue.requestedBy,
                seekTime: 0,
                startedAt: new Date()
            });
            
            // 음악 히스토리 저장
            await saveMusicHistory({
                guildId,
                userId: queue.requestedBy,
                ytId: MusicUtils.extractYouTubeId(query),
                videoUrl: query,
                startTime: new Date(),
                expireTime: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7), // 7 days
                duration: 0, // 실제 길이는 알 수 없으므로 0으로 설정
                lastSeek: 0
            });
            
            // 재생 완료 이벤트 처리
            player.on(AudioPlayerStatus.Idle, async () => {
                // 다음 곡 재생
                await MusicUtils.playNextYtDlp(guildId, voiceChannel, null, client);
            });
            
            // 오류 처리
            player.on('error', async (error) => {
                console.error('플레이어 오류:', error);
                await MusicUtils.playNextYtDlp(guildId, voiceChannel, null, client);
            });
            
            if (interaction) await safeReply(interaction, `재생 중: **${MusicUtils.getTrackTitle(queue.track)}**`);
        } catch (error) {
            console.error('음악 재생 중 오류 발생:', error);
            if (interaction) await safeReply(interaction, '음악 재생 중 오류가 발생했습니다.');
            MusicUtils.nowPlaying.set(guildId, null);
        }
        
        if (client) await autoUpdateMusicStatusEmbed(client, guildId);
    }

    public static getTrackTitle(track: LavalinkTrack | { title: string; query?: string; info?: Partial<LavalinkTrackInfo> }): string {
        if ('info' in track && track.info && track.info.title) return track.info.title;
        if ('title' in track && track.title) return track.title;
        return '제목 없음';
    }

    public static getTrackUrl(track: LavalinkTrack | { title: string; query?: string; info?: Partial<LavalinkTrackInfo> }): string {
        if ('info' in track && track.info && track.info.uri) return track.info.uri;
        if ('query' in track && track.query) return track.query;
        return '';
    }

    public static getMusicStatus(guildId: string) {
        const np = MusicUtils.nowPlaying.get(guildId);
        if (!np || !np.track) {
            return {
                isPlaying: false,
                isPaused: false,
                title: '',
                requestedBy: '',
                url: '',
                progress: '',
                timeLeft: ''
            };
        }
        const duration = 'info' in np.track && np.track.info && typeof np.track.info.length === 'number' ? np.track.info.length : 0;
        const seek = np.seek || 0;
        const elapsed = Math.min(seek, duration);
        const left = Math.max(duration - elapsed, 0);
        const barLen = 20;
        const pos = duration > 0 ? Math.floor((elapsed / duration) * barLen) : 0;
        const bar = '▬'.repeat(pos) + '🔘' + '▬'.repeat(barLen - pos - 1);
        return {
            isPlaying: true,
            isPaused: !!np.audioPlayer?.state?.status && np.audioPlayer.state.status === 'paused',
            title: MusicUtils.getTrackTitle(np.track),
            requestedBy: np.requestedBy,
            url: MusicUtils.getTrackUrl(np.track),
            progress: `${bar}  ${MusicUtils.formatTime(elapsed)} / ${MusicUtils.formatTime(duration)}`,
            timeLeft: MusicUtils.formatTime(left)
        };
    }

    public static formatTime(sec: number) {
        if (!sec || isNaN(sec)) return '0:00';
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    // YouTube ID 추출 유틸리티 함수
    public static extractYouTubeId(url: string): string {
        try {
            if (url.includes('youtube.com')) {
                // youtube.com 형식
                return new URL(url).searchParams.get('v') || '';
            } else if (url.includes('youtu.be')) {
                // youtu.be 형식
                const pathname = new URL(url).pathname;
                return pathname.substring(1).split('?')[0]; // /gHxxU-Sot1Y?t=1326 -> gHxxU-Sot1Y
            }
            return url.length <= 32 ? url : url.substring(0, 32); // ID가 아니라면 잘라서 저장
        } catch (e) {
            console.error('YouTube ID 추출 실패:', e);
            // 에러가 발생하면 URL을 최대 32자로 잘라 반환
            return url.length <= 32 ? url : url.substring(0, 32);
        }
    }
}

// Interaction 타입 유틸: 사용자 ID 추출
export function getInteractionUserId(interaction: CommandInteraction | ButtonInteraction): string {
    return interaction.user.id;
}

// Interaction 타입 유틸: 길드 ID 추출
export function getInteractionGuildId(interaction: CommandInteraction | ButtonInteraction): string | null {
    return interaction.guildId ?? null;
}

// Interaction 타입 유틸: 채널 ID 추출
export function getInteractionChannelId(interaction: CommandInteraction | ButtonInteraction): string | null {
    return interaction.channelId ?? null;
}

// 예외 안내 메시지 유틸
export async function safeReply(interaction: CommandInteraction | ButtonInteraction, content: string, ephemeral = true) {
    try {
        if ('replied' in interaction && !interaction.replied) {
            await interaction.reply({ content, ephemeral });
        } else if ('followUp' in interaction) {
            await interaction.followUp({ content, ephemeral });
        }
    } catch (e) {
        // 무시
    }
}
