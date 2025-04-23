import { CommandInteraction, GuildMember } from 'discord.js';
import { searchTracks, playNext, queues, nowPlaying } from '../utils/music';

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

    // === Lavalink로 재생 불가시 yt-dlp로 시도 ===
    await interaction.editReply('Lavalink로 트랙을 불러올 수 없어 yt-dlp로 재생을 시도합니다...');
    // yt-dlp로 오디오 스트림 URL 추출
    const { getYtDlpAudioUrl } = await import('../utils/yt-dlp');
    const streamUrl = await getYtDlpAudioUrl(query);
    if (!streamUrl) {
        await interaction.editReply('yt-dlp로도 오디오 스트림을 추출할 수 없습니다.');
        return;
    }
    // === ffmpeg 경로를 환경변수에 동적으로 지정 ===
    const { getCustomFfmpegPath } = await import('../utils/ffmpeg-path');
    const customFfmpeg = getCustomFfmpegPath();
    if (customFfmpeg) {
        process.env.FFMPEG_PATH = customFfmpeg;
        process.env.FFMPEG_BIN = customFfmpeg;
    }
    // Discord.js Voice로 직접 오디오 송출(간단 예시, 실제 구현은 별도 utils 필요)
    // 추후: utils/voice.ts 등으로 분리 권장
    const { joinVoiceChannel, createAudioPlayer, createAudioResource, entersState, AudioPlayerStatus, getVoiceConnection } = await import('@discordjs/voice');
    const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator as any
    });
    const player = createAudioPlayer();
    const resource = createAudioResource(streamUrl, {
        inlineVolume: true,
        inputType: undefined,
        metadata: {},
        // ffmpeg 경로 지정 (prism-media가 환경변수 사용)
        // spawnOptions: { env: { ...process.env, FFMPEG_PATH: customFfmpeg } }
    });
    player.play(resource);
    connection.subscribe(player);
    player.on(AudioPlayerStatus.Idle, () => {
        connection.destroy();
    });
    await interaction.editReply('yt-dlp로 오디오 스트림을 재생합니다.');
}
