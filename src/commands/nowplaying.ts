import { CommandInteraction } from 'discord.js';
import { nowPlaying } from '../utils/music';

export default async function handleNowPlaying(interaction: CommandInteraction) {
    const guildId = interaction.guildId!;
    const np = nowPlaying.get(guildId);
    if (!np) {
        await interaction.reply('현재 재생 중인 곡이 없습니다.');
        return;
    }
    await interaction.reply(`현재 재생 중: **${np.track.info.title}** (요청자: <@${np.requestedBy}>)`);
}
