import { CommandInteraction, ButtonInteraction } from 'discord.js';
import { MusicUtils, safeReply } from '../utils/music';

export default async function handleQueue(interaction: CommandInteraction | ButtonInteraction) {
    const guildId = interaction.guildId!;
    const queue = MusicUtils['queues'].get(guildId) || [];
    if (!queue.length) {
        await safeReply(interaction, '⏳ 대기열이 비어 있어요. 듣고 싶은 노래를 먼저 추가해 주세요!');
        return;
    }
    const desc = queue.map((item: any, i: number) => {
        const title = item.track?.title || item.track?.info?.title || '제목 없음';
        return `**${i + 1}. ${title}**  •  요청자: <@${item.requestedBy}>`;
    }).join('\n');
    await safeReply(interaction, `🎶 현재 대기열\n${desc}`);
}
