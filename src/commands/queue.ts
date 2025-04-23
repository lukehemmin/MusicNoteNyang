import { CommandInteraction } from 'discord.js';
import { queues } from '../utils/music';

export default async function handleQueue(interaction: CommandInteraction) {
    const guildId = interaction.guildId!;
    const queue = queues.get(guildId) || [];
    if (!queue.length) {
        await interaction.reply('대기열이 비어 있습니다.');
        return;
    }
    const desc = queue.map((item, i) => `${i + 1}. **${item.track.info.title}** (요청자: <@${item.requestedBy}>)`).join('\n');
    await interaction.reply(`대기열:\n${desc}`);
}
