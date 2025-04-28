import { CommandInteraction, ButtonInteraction } from 'discord.js';
import { MusicUtils, safeReply } from '../utils/music';
import { autoUpdateMusicStatusEmbed } from '../handlers/musicStatusEmbed';

// CommandInteraction | ButtonInteraction 모두 지원
export default async function handlePause(interaction: CommandInteraction | ButtonInteraction, client: any) {
    const guildId = interaction.guildId!;
    const nowPlaying = MusicUtils['nowPlaying'].get(guildId);
    
    if (!nowPlaying) {
        await safeReply(interaction, '⏳ 일시정지할 곡이 없어요. 음악을 먼저 재생해 주세요!');
        return;
    }
    
    // Lavalink 플레이어 확인
    const player = client.lavalink?.players.get(guildId);
    
    // yt-dlp 오디오 플레이어 확인
    const isYtDlpPlaying = nowPlaying?.audioPlayer !== undefined;
    
    if (player && player.pause) {
        // Lavalink 플레이어 일시정지
        player.pause(true);
        await safeReply(interaction, '⏸️ 음악을 잠시 멈췄어요. 다시 듣고 싶으면 `/resume`을 사용해 주세요!');
        await autoUpdateMusicStatusEmbed(client, guildId);
    } else if (isYtDlpPlaying && nowPlaying.audioPlayer && nowPlaying.audioPlayer.pause) {
        // yt-dlp 플레이어 일시정지
        nowPlaying.audioPlayer.pause();
        await safeReply(interaction, '⏸️ 음악을 잠시 멈췄어요. 다시 듣고 싶으면 `/resume`을 사용해 주세요!');
        await autoUpdateMusicStatusEmbed(client, guildId);
    } else {
        await safeReply(interaction, '⏳ 일시정지할 곡이 없어요. 음악을 먼저 재생해 주세요!');
    }
}
