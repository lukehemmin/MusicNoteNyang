import { CommandInteraction, ButtonInteraction } from 'discord.js';
import { MusicUtils, safeReply } from '../utils/music';
import { autoUpdateMusicStatusEmbed } from '../handlers/musicStatusEmbed';
import { getVoiceConnection } from '@discordjs/voice';

export default async function handleStop(interaction: CommandInteraction | ButtonInteraction, client: any) {
    const guildId = interaction.guildId!;
    const nowPlaying = MusicUtils['nowPlaying'].get(guildId);
    
    // Lavalink 플레이어 확인
    const player = client.lavalink?.players.get(guildId);
    
    // yt-dlp 오디오 플레이어 확인
    const isYtDlpPlaying = nowPlaying?.audioPlayer !== undefined;
    
    if (player && player.stop) {
        // Lavalink 플레이어 정지
        player.stop();
        MusicUtils['nowPlaying'].set(guildId, null);
        MusicUtils['queues'].set(guildId, []);
        await safeReply(interaction, '⏹️ 음악을 완전히 멈추고 대기열을 비웠어요.');
        await autoUpdateMusicStatusEmbed(client, guildId);
    } else if (isYtDlpPlaying && nowPlaying?.audioPlayer) {
        // yt-dlp 플레이어 정지
        nowPlaying.audioPlayer.stop();
        MusicUtils['nowPlaying'].set(guildId, null);
        MusicUtils['queues'].set(guildId, []);
        await safeReply(interaction, '⏹️ 음악을 완전히 멈추고 대기열을 비웠어요.');
        await autoUpdateMusicStatusEmbed(client, guildId);
    } else {
        // 음성 연결 직접 종료 시도
        const connection = getVoiceConnection(guildId);
        if (connection) {
            connection.destroy();
            MusicUtils['nowPlaying'].set(guildId, null);
            MusicUtils['queues'].set(guildId, []);
            await safeReply(interaction, '⏹️ 음악을 완전히 멈추고 대기열을 비웠어요.');
            await autoUpdateMusicStatusEmbed(client, guildId);
        } else {
            await safeReply(interaction, '⏹️ 음악을 멈출 수 없습니다.');
        }
    }
}
