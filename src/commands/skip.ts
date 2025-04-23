import { CommandInteraction, GuildMember, PermissionsBitField } from 'discord.js';
import { queues, nowPlaying } from '../utils/music';

export default async function handleSkip(interaction: CommandInteraction, client: any) {
    const member = interaction.member as GuildMember;
    const guildId = interaction.guildId!;
    const queue = queues.get(guildId) || [];
    const np = nowPlaying.get(guildId);
    const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator);
    if (!np) {
        await interaction.reply('재생 중인 곡이 없습니다.');
        return;
    }
    if (np.requestedBy !== member.id && !isAdmin) {
        await interaction.reply('요청자 또는 관리자만 스킵할 수 있습니다.');
        return;
    }
    const player = client.lavalink.players.get(guildId);
    if (player) player.stop();
    await interaction.reply('스킵되었습니다.');
}
