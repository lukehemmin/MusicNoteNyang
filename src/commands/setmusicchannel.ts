import { CommandInteraction, ChannelType, PermissionsBitField, TextChannel } from 'discord.js';
import { setMusicChannel } from '../utils/musicChannelDB';

export default async function handleSetMusicChannel(interaction: CommandInteraction) {
    // Discord.js v14: getChannel은 getChannel(name) 대신 getChannel(optionName) 사용 불가, getChannel 메서드 없음
    // getChannel 대신 get('채널')로 channel option 추출
    const channel = interaction.options.get('채널')?.channel;
    if (!channel || channel.type !== ChannelType.GuildText) {
        await interaction.reply({
            ephemeral: true,
            embeds: [{
                color: 0xe74c3c,
                description: '텍스트 채널만 지정할 수 있어요!'
            }]
        });
        return;
    }
    // 권한 체크
    const me = interaction.guild?.members.me;
    if (!me?.permissionsIn(channel as TextChannel).has(PermissionsBitField.Flags.SendMessages)) {
        await interaction.reply({
            ephemeral: true,
            embeds: [{
                color: 0xe74c3c,
                description: '해당 채널에 메시지를 보낼 권한이 없습니다.'
            }]
        });
        return;
    }
    await setMusicChannel(interaction.guildId!, channel.id);

    // 음악 상태 embed 메시지 전송 및 메시지 ID 기록
    const { updateMusicStatusEmbed } = require('../handlers/musicStatusEmbed');
    await updateMusicStatusEmbed(interaction.client, interaction.guildId!);

    await interaction.reply({
        embeds: [{
            color: 0x2ecc71,
            description: `이제부터 음악 상태 메시지는 <#${channel.id}>에서 관리돼요!`
        }],
        ephemeral: true
    });
}
