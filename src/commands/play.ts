import { CommandInteraction, GuildMember } from 'discord.js';
import { searchTracks, playNext, queues, nowPlaying } from '../utils/music';

export default async function handlePlay(interaction: CommandInteraction) {
    const member = interaction.member as GuildMember;
    const voiceChannel = member.voice?.channel;
    const guildId = interaction.guildId!;
    if (!voiceChannel) {
        await interaction.reply({ content: '음성 채널에 먼저 접속해주세요.', ephemeral: true });
        return;
    }
    // 타입 오류 우회: options를 any로 캐스팅하여 getString 사용
    const query = (interaction.options as any).getString('query', true);
    await interaction.deferReply();
    const tracks = await searchTracks(query);
    if (!tracks.length) {
        await interaction.editReply('검색 결과가 없습니다.');
        return;
    }
    const track = tracks[0];
    if (!queues.has(guildId)) queues.set(guildId, []);
    queues.get(guildId)!.push({ track, requestedBy: member.id });
    await interaction.editReply(`대기열에 추가됨: **${track.info.title}**`);
    if (!nowPlaying.get(guildId)) playNext(guildId, voiceChannel.id, interaction);
}
