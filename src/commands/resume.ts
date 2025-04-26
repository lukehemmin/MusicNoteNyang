import { CommandInteraction } from 'discord.js';
import { nowPlaying } from '../utils/music';

export default async function handleResume(interaction: CommandInteraction, client: any) {
    const guildId = interaction.guildId!;
    // Lavalink player 우선
    const player = client.lavalink.players.get(guildId);
    if (player && player.paused) {
        player.pause(false);
        await interaction.reply({
            embeds: [{
                color: 0x2ecc71,
                description: '▶️ 음악을 다시 들려드릴게요!'
            }]
        });
        return;
    }
    // yt-dlp 직접 재생용: nowPlaying에서 audioPlayer.unpause() 호출
    const np = nowPlaying.get(guildId);
    if (np && np.audioPlayer && typeof np.audioPlayer.unpause === 'function') {
        np.audioPlayer.unpause();
        await interaction.reply({
            embeds: [{
                color: 0x2ecc71,
                description: '▶️ 음악을 다시 들려드릴게요!'
            }]
        });
        return;
    }
    if (np && np.track && np.seek !== undefined && np.track.query) {
        await interaction.deferReply();
        // yt-dlp로 새 URL 추출
        const { getYtDlpAudioUrl } = await import('../utils/yt-dlp');
        const streamUrl = await getYtDlpAudioUrl(np.track.query);
        if (!streamUrl) {
            await interaction.reply({
                embeds: [{
                    color: 0xe74c3c,
                    description: '오디오 스트림을 다시 추출하지 못했어요. 다시 시도해 주세요!'
                }]
            });
            return;
        }
        // ffmpeg seek 옵션 적용 (ffmpegArgs 대신 'input' 파라미터에 직접 적용)
        // ffmpegArgs는 createAudioResource의 공식 옵션이 아님
        const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = await import('@discordjs/voice');
        const ffmpeg = require('prism-media').FFmpeg;
        const member = interaction.member as any;
        const voiceChannel = member.voice?.channel;
        if (!voiceChannel) {
            await interaction.reply({
                embeds: [{
                    color: 0xe74c3c,
                    description: '음성 채널에 먼저 접속해 주세요!'
                }]
            });
            return;
        }
        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: voiceChannel.guild.id,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator as any
        });
        const seekSeconds = np.seek || 0;
        const ffmpegArgsArr = seekSeconds > 0 ? ['-ss', seekSeconds.toString(), '-i', streamUrl, '-f', 'webm', '-vn', 'pipe:1'] : ['-i', streamUrl, '-f', 'webm', '-vn', 'pipe:1'];
        const ffmpegStream = new ffmpeg({ args: ffmpegArgsArr });
        const resource = createAudioResource(ffmpegStream, {
            inlineVolume: true,
            inputType: undefined,
            metadata: {},
        });
        const player2 = createAudioPlayer();
        player2.play(resource);
        connection.subscribe(player2);
        np.audioResource = resource;
        nowPlaying.set(guildId, np);
        player2.on(AudioPlayerStatus.Idle, () => {
            connection.destroy();
        });
        await interaction.reply({
            embeds: [{
                color: 0x2ecc71,
                description: '일시정지된 위치부터 다시 재생합니다!'
            }]
        });
        return;
    }
    await interaction.reply({
        embeds: [{
            color: 0x95a5a6,
            description: '⏳ 다시 재생할 곡이 없어요. `/play`로 음악을 먼저 재생해 주세요!'
        }]
    });
}
