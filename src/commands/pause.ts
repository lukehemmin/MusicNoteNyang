import { CommandInteraction } from 'discord.js';
import { nowPlaying } from '../utils/music';

export default async function handlePause(interaction: CommandInteraction, client: any) {
    const guildId = interaction.guildId!;
    // Lavalink player 우선
    const player = client.lavalink.players.get(guildId);
    if (player && !player.paused) {
        player.pause(true);
        await interaction.reply({
            embeds: [{
                color: 0xf1c40f,
                description: '⏸️ 음악을 잠시 멈췄어요. 다시 듣고 싶으면 `/resume`을 사용해 주세요!'
            }]
        });
        return;
    }
    // yt-dlp 직접 재생용: nowPlaying에 audioPlayer.pause() 호출
    const np = nowPlaying.get(guildId);
    if (np && np.audioPlayer && typeof np.audioPlayer.pause === 'function') {
        np.audioPlayer.pause();
        await interaction.reply({
            embeds: [{
                color: 0xf1c40f,
                description: '⏸️ 음악을 잠시 멈췄어요. 다시 듣고 싶으면 `/resume`을 사용해 주세요!'
            }]
        });
        return;
    }
    if (np && np.audioResource && np.audioResource.playbackDuration !== undefined) {
        np.seek = Math.floor(np.audioResource.playbackDuration / 1000);
        nowPlaying.set(guildId, np);
        await interaction.reply({
            embeds: [{
                color: 0xf1c40f,
                description: '⏸️ 음악을 잠시 멈췄어요. 다시 듣고 싶으면 `/resume`을 사용해 주세요!'
            }]
        });
        return;
    }
    await interaction.reply({
        embeds: [{
            color: 0x95a5a6,
            description: '⏳ 일시정지할 곡이 없어요. 음악을 먼저 재생해 주세요!'
        }]
    });
}
