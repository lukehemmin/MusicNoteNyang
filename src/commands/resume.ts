import { CommandInteraction } from 'discord.js';

export default async function handleResume(interaction: CommandInteraction, client: any) {
    const guildId = interaction.guildId!;
    const player = client.lavalink.players.get(guildId);
    if (!player || !player.paused) {
        await interaction.reply('일시정지된 곡이 없습니다.');
        return;
    }
    player.pause(false);
    await interaction.reply('다시 재생합니다.');
}
