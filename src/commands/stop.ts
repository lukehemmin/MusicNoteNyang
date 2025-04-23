import { CommandInteraction } from 'discord.js';
import { queues, nowPlaying } from '../utils/music';

export default async function handleStop(interaction: CommandInteraction, client: any) {
    const guildId = interaction.guildId!;
    const player = client.lavalink.players.get(guildId);
    if (player) player.destroy();
    queues.set(guildId, []);
    nowPlaying.set(guildId, null);
    await interaction.reply('재생을 중지하고 대기열을 초기화했습니다.');
}
