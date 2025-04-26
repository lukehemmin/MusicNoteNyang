import { CommandInteraction, GuildMember } from 'discord.js';
import { searchTracks, playNext, queues, nowPlaying, pendingProcesses } from '../utils/music';
import { saveMusicHistory } from '../db/musicHistory.repository';

export default async function handlePlay(interaction: CommandInteraction) {
    const member = interaction.member as GuildMember;
    const voiceChannel = member.voice?.channel;
    const guildId = interaction.guildId!;
    if (!voiceChannel) {
        await interaction.reply({ content: '음성 채널에 먼저 접속해주세요.', ephemeral: true });
        return;
    }
    // 타입 오류 우회: options를 any로 캐스팅하여 getString 사용
    const query = (interaction.options as any).getString('query', true);
    await interaction.deferReply();
    let tracks: any[] = [];
    let lavalinkPlayable = true;
    try {
        tracks = await searchTracks(query);
    } catch (err) {
        lavalinkPlayable = false;
    }
    if (!tracks.length) lavalinkPlayable = false;

    if (lavalinkPlayable) {
        const track = tracks[0];
        if (!queues.has(guildId)) queues.set(guildId, []);
        queues.get(guildId)!.push({ track, requestedBy: member.id });
        await interaction.editReply(`대기열에 추가됨: **${track.info.title}**`);
        if (!nowPlaying.get(guildId)) playNext(guildId, voiceChannel.id, interaction);
        return;
    }

    // === 이미 재생 중이면 queue에만 추가하고 즉시 재생하지 않음 ===
    if (nowPlaying.get(guildId)) {
        // Lavalink 큐 방식과 동일하게 yt-dlp도 큐에 추가
        if (!queues.has(guildId)) queues.set(guildId, []);
        // yt-dlp용 큐 아이템 구조 (streamUrl, title, requestedBy)
        // streamUrl은 재생 직전에 추출해야 하므로 여기서는 query와 title만 저장
        let title = '';
        try {
            const { spawn } = await import('child_process');
            const titleArgs = [
                '--no-playlist',
                '--get-title',
            ];
            if (!/^https?:\/\//.test(query)) {
                titleArgs.push('--default-search', 'ytsearch');
            }
            titleArgs.push(query);
            let titleRaw = '';
            await new Promise<void>((resolveTitle, rejectTitle) => {
                const proc = spawn('yt-dlp', titleArgs);
                proc.stdout.on('data', (data: Buffer) => {
                    titleRaw += data.toString();
                });
                proc.on('close', () => resolveTitle());
                proc.on('error', (err: Error) => rejectTitle(err));
            });
            title = titleRaw.trim();
        } catch (e) {
            title = '';
        }
        let displayTitle = title;
        const MAX_LEN = 40;
        if (title.length > MAX_LEN) {
            displayTitle = title.slice(0, MAX_LEN - 3) + '...';
        }
        queues.get(guildId)!.push({ track: { query, title: displayTitle }, requestedBy: member.id });
        await interaction.editReply(displayTitle ? `${displayTitle}를 대기열에 추가했습니다!` : '음악을 대기열에 추가했습니다!');
        return;
    }

    // === 최초 재생(아무것도 재생 중이 아닐 때만) ===
    console.log('Lavalink로 트랙을 불러올 수 없어 yt-dlp로 재생을 시도합니다...');
    await interaction.editReply('음악을 준비 중입니다. 잠시만 기다려 주세요! 🎵');
    const { spawn } = await import('child_process');
    const args = [
        '-f', 'bestaudio',
        '--no-playlist',
        '--get-title',
        '--get-url'
    ];
    if (!/^https?:\/\//.test(query)) {
        args.push('--default-search', 'ytsearch');
    }
    args.push(query);
    let title = '';
    let streamUrl = '';
    await new Promise<void>((resolve, reject) => {
        let out = '';
        const proc = spawn('yt-dlp', args);
        pendingProcesses.set(guildId, { ytDlpProc: proc });
        nowPlaying.set(guildId, {
            track: { query, title: '' },
            requestedBy: member.id,
            seek: 0,
            audioResource: null,
            pending: true
        });
        proc.stdout.on('data', (data: Buffer) => { out += data.toString(); });
        proc.on('close', () => {
            const [t, u] = out.trim().split('\n');
            title = t || '';
            streamUrl = u || '';
            pendingProcesses.delete(guildId);
            resolve();
        });
        proc.on('error', (err: Error) => { pendingProcesses.delete(guildId); reject(err); });
    });
    if (!streamUrl) {
        nowPlaying.set(guildId, null);
        await interaction.editReply('음악 재생에 실패했습니다. (yt-dlp 오류)');
        return;
    }
    let displayTitle = title;
    const MAX_LEN = 40;
    if (title.length > MAX_LEN) {
        displayTitle = title.slice(0, MAX_LEN - 3) + '...';
    }
    const playMsg = displayTitle ? `지금 재생: **${displayTitle}**` : '음악을 재생합니다!';
    const { getCustomFfmpegPath } = await import('../utils/ffmpeg-path');
    const customFfmpeg = getCustomFfmpegPath();
    if (customFfmpeg) {
        process.env.FFMPEG_PATH = customFfmpeg;
        process.env.FFMPEG_BIN = customFfmpeg;
    }
    const { joinVoiceChannel, createAudioPlayer, createAudioResource, entersState, AudioPlayerStatus, getVoiceConnection } = await import('@discordjs/voice');
    console.log('[play] streamUrl:', streamUrl);
    console.log('[play] ffmpeg path:', process.env.FFMPEG_PATH);

    // 볼륨: 길드별 DB에서 가져오고, 없으면 50을 저장
    let volume = 0.5;
    try {
        let v = await import('../db/volume.repository').then(m => m.getGuildVolume(guildId));
        if (v === undefined || v === null) {
            await import('../db/volume.repository').then(m => m.setGuildVolume(guildId, 50));
            v = 50;
        }
        volume = Math.max(0, Math.min(100, v)) / 100;
    } catch (e) {
        console.error('[play] 볼륨 조회/저장 오류:', e);
        volume = 0.5;
    }

    let resource: any;
    try {
        resource = createAudioResource(streamUrl, {
            inlineVolume: true,
            inputType: undefined,
            metadata: {},
        });
        if (resource.volume) resource.volume.setVolume(volume);
    } catch (e) {
        console.error('[play] createAudioResource 실패:', e);
        await interaction.editReply('오디오 리소스 생성에 실패했습니다. 관리자에게 문의하세요.');
        return;
    }
    const player = createAudioPlayer();
    player.on('error', (err) => {
        console.error('[AudioPlayer Error]', err);
        interaction.followUp('오디오 재생 중 오류가 발생했습니다.');
    });
    let startedAt = 0;
    player.on(AudioPlayerStatus.Playing, () => {
        startedAt = Date.now();
    });
    player.on(AudioPlayerStatus.Idle, () => {
        const now = Date.now();
        if (startedAt && now - startedAt < 1000) {
            console.error('[play] 오디오가 너무 빨리 종료됨(1초 미만)');
            interaction.followUp('오디오 재생에 실패했습니다. (너무 빨리 종료됨)');
        }
        const queue = queues.get(guildId) || [];
        if (queue.length > 0) {
            import('../utils/music').then(mod => {
                mod.playNextYtDlp(guildId, voiceChannel, null);
            });
        } else {
            nowPlaying.set(guildId, null);
            connection.destroy();
        }
    });
    const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator as any
    });
    player.play(resource);
    connection.subscribe(player);
    nowPlaying.set(guildId, {
        track: { query, title: displayTitle },
        requestedBy: member.id,
        seek: 0,
        audioResource: resource,
        audioPlayer: player, // AudioPlayer 인스턴스 저장
        pending: false
    });
    // 실시간 상태 안내
    await interaction.editReply(playMsg + `\n(대기열: ${queues.get(guildId)?.length || 0}곡)`);
    // --- DB에 재생 기록 저장 ---
    if (streamUrl) {
        const expireTimestamp = parseExpireFromUrl(streamUrl);
        const expireTime = new Date(expireTimestamp * 1000);
        const duration = 0;
        await saveMusicHistory({
            userId: interaction.user.id,
            guildId: guildId,
            videoUrl: streamUrl,
            ytId: '',
            startTime: new Date(),
            expireTime,
            duration,
            lastSeek: 0
        });
    }
}

// yt-dlp URL에서 expire 파싱 함수
function parseExpireFromUrl(url: string): number {
    const match = url.match(/expire=(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
}
