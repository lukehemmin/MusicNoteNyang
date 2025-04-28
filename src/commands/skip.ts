import { CommandInteraction, ButtonInteraction, GuildMember, PermissionsBitField } from 'discord.js';
import { MusicUtils } from '../utils/music';
import { autoUpdateMusicStatusEmbed } from '../handlers/musicStatusEmbed';
import { getVoiceConnection } from '@discordjs/voice';

export default async function handleSkip(interaction: CommandInteraction | ButtonInteraction, client: any) {
    const guildId = interaction.guildId!;
    const member = interaction.member as GuildMember | null;
    const userId = interaction.user.id;
    const nowPlaying = MusicUtils['nowPlaying'].get(guildId);
    
    // Lavalink 플레이어 확인
    const player = client.lavalink?.players.get(guildId);
    
    // yt-dlp 오디오 플레이어 확인 (audioPlayer가 있는지 확인)
    const isYtDlpPlaying = nowPlaying?.audioPlayer !== undefined;
    
    if (!nowPlaying) {
        await interaction.reply({ content: '⏭️ 건너뛸 곡이 없습니다.', ephemeral: true });
        return;
    }

    const isAdmin = member?.permissions.has(PermissionsBitField.Flags.Administrator);
    if (userId !== nowPlaying.requestedBy && !isAdmin) {
        await interaction.reply({ content: '이 곡을 스킵할 권한이 없습니다. (요청자 또는 관리자만 가능)', ephemeral: true });
        return;
    }

    // Lavalink 또는 yt-dlp 플레이어를 정지
    if (player && player.stop) {
        player.stop();
    } else if (isYtDlpPlaying && nowPlaying.audioPlayer) {
        // yt-dlp 플레이어 정지
        nowPlaying.audioPlayer.stop();
    } else {
        // 음성 연결 종료 시도
        const connection = getVoiceConnection(guildId);
        if (connection) {
            connection.destroy();
        }
    }
    
    MusicUtils['nowPlaying'].set(guildId, null);
    await autoUpdateMusicStatusEmbed(client, guildId);
    await interaction.reply({ content: '⏭️ 곡을 건너뛰었습니다.', ephemeral: true });
}
