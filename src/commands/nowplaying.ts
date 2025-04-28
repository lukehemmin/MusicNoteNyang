import { CommandInteraction, ButtonInteraction } from 'discord.js';
import { MusicUtils } from '../utils/music';

export default async function handleNowPlaying(interaction: CommandInteraction | ButtonInteraction) {
    const guildId = interaction.guildId!;
    const nowPlaying = MusicUtils['nowPlaying'].get(guildId);
    if (!nowPlaying || !nowPlaying.track) {
        await interaction.reply({ content: '현재 재생 중인 곡이 없습니다.', ephemeral: true });
        return;
    }
    const title = MusicUtils.getTrackTitle(nowPlaying.track);
    const url = MusicUtils.getTrackUrl(nowPlaying.track);
    await interaction.reply({
        content: `🎵 **지금 재생 중:** ${title}${url ? `\n🔗 [링크](${url})` : ''} (요청자: <@${nowPlaying.requestedBy}>)`,
        ephemeral: true
    });
}
