import { Client, TextChannel, Message, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder, Colors } from 'discord.js';
import { getMusicChannel, getMusicMessage, setMusicMessage } from '../utils/musicChannelDB';
import { getMusicStatus } from '../utils/music';

/**
 * 음악 상태 embed 메시지를 전송/수정하고, 버튼 컨트롤을 붙임
 */
export async function updateMusicStatusEmbed(client: Client, guildId: string) {
    const channelId = await getMusicChannel(guildId);
    if (!channelId) return;
    const channel = await client.channels.fetch(channelId).catch(() => null) as TextChannel | null;
    if (!channel) return;

    // embed & 버튼 생성
    const status = getMusicStatus(guildId);
    const embed = new EmbedBuilder()
        .setColor(status.isPlaying ? Colors.Blurple : Colors.Grey)
        .setTitle(status.isPlaying ? `🎶 지금 재생 중: ${status.title}` : '⏹️ 음악이 재생되고 있지 않아요')
        .setDescription(status.isPlaying ?
            `요청자: <@${status.requestedBy}>
[🔗 유튜브로 이동하기](${status.url})

${status.progress}` :
            '노래를 추가하려면 `/play` 명령을 사용해 주세요!')
        .setFooter({ text: status.isPlaying ? `남은 시간: ${status.timeLeft}` : '' })
        .setTimestamp(new Date());

    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('music_pause_resume')
                .setLabel(status.isPlaying && !status.isPaused ? '일시정지' : '재개')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('music_stop')
                .setLabel('정지')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('music_skip')
                .setLabel('스킵')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('music_queue')
                .setLabel('대기열')
                .setStyle(ButtonStyle.Secondary)
        );

    // 메시지 수정 또는 새로 전송
    let messageId = await getMusicMessage(guildId);
    let message: Message | null = null;
    if (messageId) {
        try {
            message = await channel.messages.fetch(messageId);
            await message.edit({ embeds: [embed], components: [row] });
        } catch {
            message = await channel.send({ embeds: [embed], components: [row] });
            await setMusicMessage(guildId, message.id);
        }
    } else {
        message = await channel.send({ embeds: [embed], components: [row] });
        await setMusicMessage(guildId, message.id);
    }
}
