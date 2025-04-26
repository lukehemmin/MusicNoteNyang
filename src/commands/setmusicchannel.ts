import { CommandInteraction, ChannelType, TextChannel, PermissionsBitField } from 'discord.js';
import { setMusicChannel } from '../utils/musicChannelDB';

export { ChannelType };

export default async function handleSetMusicChannel(interaction: CommandInteraction) {
    // options.getChannel은 CommandInteractionOptionResolver 타입에 없으므로 as any로 우회
    const channel = (interaction.options as any).getChannel('채널');
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
                description: '이 채널에 메시지를 보낼 권한이 없어요!'
            }]
        });
        return;
    }
    await setMusicChannel(interaction.guildId!, channel.id);
    await interaction.reply({
        embeds: [{
            color: 0x2ecc71,
            description: `이제부터 음악 상태 메시지는 <#${channel.id}>에서 관리돼요!`
        }],
        ephemeral: true
    });
}
