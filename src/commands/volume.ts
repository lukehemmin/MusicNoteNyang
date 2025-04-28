import { CommandInteraction } from 'discord.js';
import { MusicUtils } from '../utils/music';
import { setGuildVolume, getGuildVolume } from '../db/volume.repository';

export default async function handleVolume(interaction: CommandInteraction) {
    const guildId = interaction.guildId!;
    // 볼륨 옵션명은 'volume'으로 통일, 0~100만 허용
    const option = interaction.options.get('volume', true);
    let volume = typeof option.value === 'number' ? option.value : Number(option.value);
    if (isNaN(volume) || volume < 0 || volume > 100) {
        await interaction.reply({ content: '볼륨은 0~100 사이의 숫자만 입력할 수 있습니다.', ephemeral: true });
        return;
    }
    await setGuildVolume(guildId, volume);
    // 볼륨 적용: 현재 재생 중이면 바로 반영
    const nowPlaying = MusicUtils['nowPlaying'].get(guildId);
    if (nowPlaying && nowPlaying.audioResource && nowPlaying.audioResource.volume) {
        nowPlaying.audioResource.volume.setVolume(volume / 100);
    }
    await interaction.reply(`볼륨이 ${volume}%로 설정되었습니다.`);
}
