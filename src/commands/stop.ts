import { CommandInteraction } from 'discord.js';
import { queues, nowPlaying } from '../utils/music';

export default async function handleStop(interaction: CommandInteraction, client: any) {
    const guildId = interaction.guildId!;
    // Lavalink 플레이어 중지
    const player = client.lavalink.players.get(guildId);
    if (player) player.destroy();
    // yt-dlp/ffmpeg 직접 재생 중이면 AudioPlayer/VoiceConnection도 중지
    const { nowPlaying, abortPendingProcess } = await import('../utils/music');
    const np = nowPlaying.get(guildId);
    if (np) {
        if (np.audioPlayer && typeof np.audioPlayer.stop === 'function') {
            np.audioPlayer.stop();
        }
        // 혹시 남아있는 프로세스도 안전하게 종료 (pending 상태 포함)
        abortPendingProcess(guildId);
    }
    // VoiceConnection도 안전하게 종료
    const { getVoiceConnection } = await import('@discordjs/voice');
    const conn = getVoiceConnection(guildId);
    if (conn) conn.destroy();
    // 큐/nowPlaying 비우기
    queues.set(guildId, []);
    nowPlaying.set(guildId, null);
    await interaction.reply({
        embeds: [{
            color: 0xe74c3c,
            description: '⏹️ 음악 재생을 완전히 멈추고 대기열도 모두 정리했어요!'
        }]
    });
}
