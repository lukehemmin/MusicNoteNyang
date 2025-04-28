import { Client, TextChannel, Message, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder, Colors } from 'discord.js';
import { getMusicChannel, getMusicMessage, setMusicMessage } from '../utils/musicChannelDB';
import { MusicUtils } from '../utils/music';

/**
 * 음악 상태 embed 메시지를 전송/수정하고, 버튼 컨트롤을 붙임
 */
export async function updateMusicStatusEmbed(client: Client, guildId: string) {
    const channelId = await getMusicChannel(guildId);
    if (!channelId) return;
    const channel = await client.channels.fetch(channelId).catch(() => null) as TextChannel | null;
    if (!channel) return;

    // embed & 버튼 생성
    const status = getMusicStatusEmbed(guildId);
    const embed = new EmbedBuilder()
        .setColor(status.description === '현재 재생 중인 곡이 없습니다.' ? Colors.Grey : Colors.Blurple)
        .setTitle(status.title || (status.description === '현재 재생 중인 곡이 없습니다.' ? '⏹️ 음악이 재생되고 있지 않아요' : '🎶 지금 재생 중'))
        .setDescription(status.description)
        .setTimestamp(new Date());
    // footer 텍스트가 있을 때만 setFooter 호출
    if (status.footerText && status.footerText.length > 0) {
        embed.setFooter({ text: status.footerText });
    }

    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('music_pause_resume')
                .setLabel('일시정지')
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

// 음악 상태 embed 메시지 자동 갱신: 주요 이벤트에 hook 함수 제공
export async function autoUpdateMusicStatusEmbed(client: Client, guildId: string) {
    try {
        await updateMusicStatusEmbed(client, guildId);
    } catch (e) {
        console.error(`[embed] 음악 상태 embed 갱신 실패:`, e);
    }
}

export function getMusicStatusEmbed(guildId: string): {
    title?: string;
    description: string;
    footerText?: string;
} {
    const nowPlaying = MusicUtils['nowPlaying'].get(guildId);
    if (!nowPlaying || !nowPlaying.track) {
        return { description: '현재 재생 중인 곡이 없습니다.' };
    }
    const title = MusicUtils.getTrackTitle(nowPlaying.track);
    const url = MusicUtils.getTrackUrl(nowPlaying.track);
    return {
        title: 'Now Playing',
        description: `**${title}**${url ? `\n🔗 [링크](${url})` : ''} (요청자: <@${nowPlaying.requestedBy}>)`,
        footerText: '' // 필요시 원하는 텍스트로 변경 가능
    };
}
