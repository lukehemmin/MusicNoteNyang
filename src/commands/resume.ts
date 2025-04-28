import { CommandInteraction, ButtonInteraction } from 'discord.js';
import { MusicUtils } from '../utils/music';
import { autoUpdateMusicStatusEmbed } from '../handlers/musicStatusEmbed';

export default async function handleResume(interaction: CommandInteraction | ButtonInteraction, client: any) {
    const guildId = interaction.guildId!;
    const nowPlaying = MusicUtils['nowPlaying'].get(guildId);
    
    if (!nowPlaying) {
        await interaction.reply({
            embeds: [{
                color: 0x95a5a6,
                description: '⏳ 다시 재생할 곡이 없어요. `/play`로 음악을 먼저 재생해 주세요!'
            }]
        });
        return;
    }
    
    // Lavalink 플레이어 확인
    const player = client.lavalink?.players.get(guildId);
    
    // yt-dlp 오디오 플레이어 확인
    const isYtDlpPlaying = nowPlaying?.audioPlayer !== undefined;
    
    if (player && player.pause) {
        // Lavalink 플레이어 재개
        player.pause(false);
        await interaction.reply({
            embeds: [{
                color: 0x2ecc71,
                description: '▶️ 음악을 다시 들려드릴게요!'
            }]
        });
        await autoUpdateMusicStatusEmbed(client, guildId);
    } else if (isYtDlpPlaying && nowPlaying.audioPlayer && nowPlaying.audioPlayer.unpause) {
        // yt-dlp 플레이어 재개
        nowPlaying.audioPlayer.unpause();
        await interaction.reply({
            embeds: [{
                color: 0x2ecc71,
                description: '▶️ 음악을 다시 들려드릴게요!'
            }]
        });
        await autoUpdateMusicStatusEmbed(client, guildId);
    } else {
        await interaction.reply({
            embeds: [{
                color: 0xe74c3c,
                description: '오디오 스트림을 다시 추출하지 못했어요. 다시 시도해 주세요!'
            }]
        });
    }
}
