import { CommandInteraction } from 'discord.js';

export default async function handlePause(interaction: CommandInteraction, client: any) {
    const guildId = interaction.guildId!;
    const player = client.lavalink.players.get(guildId);
    if (!player || !player.paused) {
        await interaction.reply('일시정지할 곡이 없습니다.');
        return;
    }
    player.pause(true);
    await interaction.reply('일시정지되었습니다.');
}
