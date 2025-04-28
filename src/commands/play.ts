import { CommandInteraction, ButtonInteraction, GuildMember } from 'discord.js';
import { MusicUtils, QueueItem, safeReply, getInteractionUserId } from '../utils/music';

export default async function handlePlay(interaction: CommandInteraction | ButtonInteraction, client: any) {
    const guildId = interaction.guildId!;
    const userId = getInteractionUserId(interaction);
    const member = interaction.guild?.members.cache.get(userId) as GuildMember | undefined;
    const voiceChannel = member?.voice?.channel;
    if (!voiceChannel) {
        await safeReply(interaction, '음성 채널에 먼저 접속해주세요.');
        return;
    }
    // CommandInteraction만 옵션 지원
    let query = '';
    if ('isChatInputCommand' in interaction && interaction.isChatInputCommand()) {
        query = (interaction.options as any).getString('query', true);
    } else {
        await safeReply(interaction, '플레이 버튼은 슬래시 명령어로만 사용할 수 있습니다.');
        return;
    }
    await safeReply(interaction, '검색 및 재생 준비 중입니다...');
    console.log(`[play] query:`, query);

    let tracks: any[] = [];
    let lavalinkPlayable = true;
    try {
        tracks = await MusicUtils.searchTracks(query);
    } catch (err) {
        lavalinkPlayable = false;
    }
    if (!tracks.length) lavalinkPlayable = false;

    if (lavalinkPlayable) {
        const track = tracks[0];
        await MusicUtils.enqueue(guildId, { track, requestedBy: userId });
        await safeReply(interaction, `대기열에 추가됨: **${track.info.title}**`);
        if (!MusicUtils['nowPlaying'].get(guildId)) await MusicUtils.playNext(guildId, voiceChannel.id, interaction, client);
        return;
    }
    // yt-dlp fallback: lavalink 실패 시 MusicUtils.playNextYtDlp 사용
    if (MusicUtils['nowPlaying'].get(guildId)) {
        await MusicUtils.enqueue(guildId, { track: { query, title: query }, requestedBy: userId });
        await safeReply(interaction, '음악을 대기열에 추가했습니다!');
        return;
    }
    // 최초 재생(아무것도 재생 중이 아닐 때)
    await MusicUtils.enqueue(guildId, { track: { query, title: query }, requestedBy: userId });
    await safeReply(interaction, '음악을 준비 중입니다. 잠시만 기다려 주세요! 🎵');
    await MusicUtils.playNextYtDlp(guildId, voiceChannel, interaction);
}
