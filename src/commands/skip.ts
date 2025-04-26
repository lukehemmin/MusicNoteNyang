import { CommandInteraction, GuildMember, PermissionsBitField } from 'discord.js';
import { queues, nowPlaying } from '../utils/music';

export default async function handleSkip(interaction: CommandInteraction, client: any) {
    const member = interaction.member as GuildMember;
    const guildId = interaction.guildId!;
    const queue = queues.get(guildId) || [];
    const np = nowPlaying.get(guildId);
    const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator);
    // === pending(준비중) 상태도 재생 중으로 간주 ===
    if (!np) {
        await interaction.reply('재생 중인 곡이 없습니다.');
        return;
    }
    if (np.requestedBy !== member.id && !isAdmin) {
        await interaction.reply('요청자 또는 관리자만 스킵할 수 있습니다.');
        return;
    }
    // pending 상태면 준비중인 프로세스 종료
    if (np.pending) {
        const { abortPendingProcess } = await import('../utils/music');
        abortPendingProcess(guildId);
        nowPlaying.set(guildId, null);
        const queue = queues.get(guildId) || [];
        if (queue.length > 0 && interaction.channel) {
            await interaction.reply('준비 중인 곡을 취소했습니다. 다음 곡을 준비합니다.');
            import('../utils/music').then(mod => {
                mod.playNextYtDlp(guildId, (interaction.member as GuildMember).voice?.channel, interaction);
            });
        } else {
            await interaction.reply('준비 중인 곡을 취소했습니다. 대기열이 없어 음성방에서 나갑니다.');
        }
        return;
    }
    const player = client.lavalink.players.get(guildId);
    if (player) {
        player.stop();
        // Lavalink 플레이어에서 stop() 호출 시 playNext가 자동 호출되는지 확인 필요
        await interaction.reply('스킵되었습니다.');
        return;
    }
    // === yt-dlp 직접 재생 분기 ===
    // Discord.js Voice의 connection/player를 찾아서 stop (타입 가드 적용)
    const { getVoiceConnection } = await import('@discordjs/voice');
    const connection = getVoiceConnection(guildId);
    const state: any = connection ? connection.state : undefined;
    const sub = state && state.subscription ? state.subscription : undefined;
    if (connection && sub) {
        const player = sub.player;
        player.stop(); // 현재 곡 정지
        const queue = queues.get(guildId) || [];
        if (queue.length > 0 && interaction.channel) {
            // 다음 곡 playNextYtDlp 호출, 음성방을 나가지 않음
            await interaction.reply('스킵합니다. 다음곡을 준비중입니다.');
            import('../utils/music').then(mod => {
                mod.playNextYtDlp(guildId, (interaction.member as GuildMember).voice?.channel, interaction);
            });
        } else {
            connection.destroy();
            nowPlaying.set(guildId, null);
            await interaction.reply('대기열이 없어 음성방에서 나갑니다.');
        }
        return;
    }
    await interaction.reply('스킵되었습니다.');
}
