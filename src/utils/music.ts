import { CommandInteraction } from 'discord.js';
import { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, getVoiceConnection } from '@discordjs/voice';
import { saveMusicHistory } from '../db/musicHistory.repository';
import { getGuildVolume } from '../db/volume.repository';
import { saveResumeState, clearResumeState } from '../db/resumeState.repository';

export interface QueueItem {
    track: any;
    requestedBy: string;
    // yt-dlp 직접 재생용: 일시정지/재개를 위한 상태
    seek?: number; // 재생 위치(초)
    audioResource?: any; // AudioResource 객체 참조(선택)
    audioPlayer?: any; // AudioPlayer 인스턴스 추가
    pending?: boolean; // 준비중 상태 플래그
}

export const queues: Map<string, QueueItem[]> = new Map();
export const nowPlaying: Map<string, QueueItem | null> = new Map();
// === 멀티 프로세스 관리 강화 ===
export interface PendingProcess {
    ytDlpProc?: import('child_process').ChildProcess;
    ffmpegProc?: import('child_process').ChildProcess;
    startedAt?: number;
    status?: 'pending' | 'running' | 'ended' | 'aborted';
}
export const pendingProcesses: Map<string, PendingProcess> = new Map();

// 프로세스 상태 안전 종료 함수
export function abortPendingProcess(guildId: string) {
    const procObj = pendingProcesses.get(guildId);
    if (procObj) {
        if (procObj.ytDlpProc && !procObj.ytDlpProc.killed) {
            try { procObj.ytDlpProc.kill('SIGKILL'); } catch {}
        }
        if (procObj.ffmpegProc && !procObj.ffmpegProc.killed) {
            try { procObj.ffmpegProc.kill('SIGKILL'); } catch {}
        }
        pendingProcesses.delete(guildId);
    }
}

export async function searchTracks(query: string): Promise<any[]> {
    const LAVALINK_HOST = process.env.LAVALINK_HOST!;
    const LAVALINK_PORT = process.env.LAVALINK_PORT!;
    const LAVALINK_PASSWORD = process.env.LAVALINK_PASSWORD!;
    const params = new URLSearchParams({
        identifier: query.startsWith('http') ? query : `ytsearch:${query}`
    });
    const url = `http://${LAVALINK_HOST}:${LAVALINK_PORT}/v4/loadtracks?${params.toString()}`;
    const res = await fetch(url, {
        headers: { Authorization: LAVALINK_PASSWORD }
    });
    const data = await res.json();
    if (!data.tracks || data.tracks.length === 0) return [];
    return data.tracks;
}

export function playNext(guildId: string, voiceChannelId: string, interaction: CommandInteraction | null, client?: any) {
    const queue = queues.get(guildId) || [];
    if (!queue.length) {
        nowPlaying.set(guildId, null);
        if (interaction) interaction.followUp('대기열이 비었습니다.');
        return;
    }
    const item = queue.shift()!;
    nowPlaying.set(guildId, item);
    queues.set(guildId, queue);
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
    player.once('start', () => {
        if (interaction) interaction.followUp(`재생 중: **${item.track.info.title}**`);
    });
    player.once('end', () => {
        playNext(guildId, voiceChannelId, null, client);
    });
}

export async function playNextYtDlp(guildId: string, voiceChannel: any, interaction: CommandInteraction | null) {
    const queue = queues.get(guildId) || [];
    if (!queue.length) {
        nowPlaying.set(guildId, null);
        await clearResumeState(guildId); // 대기열이 비면 상태도 삭제
        if (interaction) await interaction.followUp('대기열이 없어 음성방에서 나갑니다.');
        const connection = getVoiceConnection(guildId);
        if (connection) connection.destroy();
        return;
    }
    const item = queue.shift()!;
    nowPlaying.set(guildId, { ...item, pending: true }); // pending 상태로 먼저 셋팅
    queues.set(guildId, queue);
    // yt-dlp로 streamUrl 추출 (프로세스 관리)
    const { spawn } = await import('child_process');
    const args = ['-f', 'bestaudio', '--no-playlist', '--get-title', '--get-url'];
    if (!/^https?:\/\//.test(item.track.query)) args.push('--default-search', 'ytsearch');
    args.push(item.track.query);
    let title = '';
    let streamUrl = '';
    await new Promise<void>((resolve, reject) => {
        let out = '';
        const proc = spawn('yt-dlp', args);
        pendingProcesses.set(guildId, { ytDlpProc: proc, startedAt: Date.now(), status: 'pending' }); // 프로세스 저장
        proc.stdout.on('data', (data: Buffer) => { out += data.toString(); });
        proc.on('close', () => {
            const [t, u] = out.trim().split('\n');
            title = t || '';
            streamUrl = u || '';
            pendingProcesses.delete(guildId); // 완료시 삭제
            resolve();
        });
        proc.on('error', (err: Error) => { pendingProcesses.delete(guildId); reject(err); });
    });
    if (!streamUrl) {
        if (interaction) await interaction.followUp('yt-dlp로 다음 곡 URL을 추출할 수 없습니다.');
        return;
    }
    // 볼륨: 길드별 DB에서 가져오고, 없으면 50%
    let volume = 0.5;
    try {
        const v = await getGuildVolume(guildId);
        volume = Math.max(0, Math.min(100, v)) / 100;
    } catch {}
    const resource = createAudioResource(streamUrl, { inlineVolume: true });
    if (resource.volume) resource.volume.setVolume(volume);
    const connection = getVoiceConnection(guildId) || joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator as any
    });
    const player = createAudioPlayer();
    let startedAt = 0;
    player.on('error', (err) => {
        console.error(`[AudioPlayer Error]`, err);
        if (interaction) interaction.followUp('오디오 재생 중 오류가 발생했습니다.');
    });
    player.on(AudioPlayerStatus.Playing, async () => {
        startedAt = Date.now();
        // === 재생 상태를 DB에 저장 ===
        try {
            await saveResumeState({
                guildId,
                voiceChannelId: voiceChannel.id,
                textChannelId: interaction?.channelId || '',
                trackUrl: streamUrl,
                title: title || '',
                requestedBy: item.requestedBy,
                seekTime: 0,
                startedAt: new Date()
            });
        } catch (e) {
            console.error('[resume] 재생 상태 저장 실패:', e);
        }
    });
    player.on(AudioPlayerStatus.Idle, async () => {
        const now = Date.now();
        if (startedAt && now - startedAt < 1000) {
            console.error('오디오가 너무 빨리 종료됨(1초 미만)');
            if (interaction) interaction.followUp('오디오 재생에 실패했습니다. (너무 빨리 종료됨)');
        }
        await clearResumeState(guildId); // 곡이 끝나면 상태 삭제
        playNextYtDlp(guildId, voiceChannel, null);
    });
    player.play(resource);
    connection.subscribe(player);
    nowPlaying.set(guildId, { ...item, audioResource: resource, audioPlayer: player, pending: false });
    // DB 기록
    const expireTimestamp = parseExpireFromUrl(streamUrl);
    const expireTime = new Date(expireTimestamp * 1000);
    await saveMusicHistory({
        userId: item.requestedBy,
        guildId: guildId,
        videoUrl: streamUrl,
        ytId: '',
        startTime: new Date(),
        expireTime,
        duration: 0,
        lastSeek: 0
    });
    if (interaction) {
        const embed = {
            color: 0x3498db,
            title: title || '음악',
            description: `지금 재생 중이에요!\n\n[🔗 유튜브로 이동하기](${item.track.query})` + (queue.length > 0 ? `\n\n**대기열:** ${queue.length}곡` : ''),
            footer: { text: `요청자: <@${item.requestedBy}>` },
            timestamp: new Date().toISOString()
        };
        await interaction.followUp({ content: undefined, embeds: [embed] });
    }
}

function parseExpireFromUrl(url: string): number {
    const match = url.match(/expire=(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
}

// 음악 상태를 embed에 표시할 수 있도록 반환하는 함수
export function getMusicStatus(guildId: string) {
    const np = nowPlaying.get(guildId);
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
    // 진행바 및 남은 시간 계산
    const duration = np.track.duration || 0;
    const seek = np.seek || 0;
    const elapsed = Math.min(seek, duration);
    const left = Math.max(duration - elapsed, 0);
    // 진행바 (이모지 20칸)
    const barLen = 20;
    const pos = Math.floor((elapsed / duration) * barLen);
    const bar = '▬'.repeat(pos) + '🔘' + '▬'.repeat(barLen - pos - 1);
    return {
        isPlaying: true,
        isPaused: !!np.audioPlayer?.state?.status && np.audioPlayer.state.status === 'paused',
        title: np.track.title || np.track.info?.title || '제목 없음',
        requestedBy: np.requestedBy,
        url: np.track.query,
        progress: `${bar}  ${formatTime(elapsed)} / ${formatTime(duration)}`,
        timeLeft: formatTime(left)
    };
}

function formatTime(sec: number) {
    if (!sec || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}
