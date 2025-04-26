import { CommandInteraction } from 'discord.js';
import { queues } from '../utils/music';

export default async function handleQueue(interaction: CommandInteraction) {
    const guildId = interaction.guildId!;
    const queue = queues.get(guildId) || [];
    if (!queue.length) {
        await interaction.reply({
            embeds: [{
                color: 0x95a5a6,
                description: '⏳ 대기열이 비어 있어요. 듣고 싶은 노래를 먼저 추가해 주세요!'
            }]
        });
        return;
    }
    const desc = queue.map((item, i) => {
        // info.title이 없을 수 있으니, track.title 또는 track.info?.title 순으로 안전하게 접근
        const title = item.track?.title || item.track?.info?.title || '제목 없음';
        return `**${i + 1}. ${title}**  •  요청자: <@${item.requestedBy}>`;
    }).join('\n');
    await interaction.reply({
        embeds: [{
            color: 0x3498db,
            title: '🎶 현재 대기열',
            description: desc,
            footer: { text: `총 ${queue.length}곡` },
            timestamp: new Date().toISOString()
        }]
    });
}
