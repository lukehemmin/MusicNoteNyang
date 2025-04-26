import { CommandInteraction, SlashCommandBuilder } from 'discord.js';
import { setGuildVolume, getGuildVolume } from '../db/volume.repository';

export const volumeCommand = new SlashCommandBuilder()
    .setName('volume')
    .setDescription('음악 재생 볼륨을 설정합니다 (0~100)')
    .addIntegerOption(opt =>
        opt.setName('수치')
            .setDescription('설정할 볼륨 (0~100)')
            .setMinValue(0)
            .setMaxValue(100)
            .setRequired(true)
    );

export default async function handleVolume(interaction: CommandInteraction) {
    const guildId = interaction.guildId!;
    const value = interaction.options.get('수치', true).value as number;
    if (value < 0 || value > 100) {
        await interaction.reply({ content: '볼륨은 0~100 사이의 정수만 가능합니다.', ephemeral: true });
        return;
    }
    await setGuildVolume(guildId, value);

    // === 현재 재생 중인 곡의 볼륨도 즉시 반영 ===
    try {
        const { nowPlaying } = await import('../utils/music');
        const np = nowPlaying.get(guildId);
        if (np && np.audioResource && np.audioResource.volume) {
            const vol = value === 0 ? 0.00001 : Math.max(0, Math.min(100, value)) / 100;
            np.audioResource.volume.setVolume(vol);
        }
    } catch (e) {
        console.error('[volume] 실시간 볼륨 반영 오류:', e);
    }

    await interaction.reply({ content: `🔊 볼륨이 ${value}%로 설정되었습니다.`, ephemeral: true });
}
