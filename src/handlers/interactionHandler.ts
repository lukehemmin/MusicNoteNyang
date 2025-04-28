import { Client, Interaction, CommandInteraction, ButtonInteraction } from 'discord.js';
import handlePlay from '../commands/play';
import handlePause from '../commands/pause';
import handleResume from '../commands/resume';
import handleStop from '../commands/stop';
import handleSkip from '../commands/skip';
import handleQueue from '../commands/queue';
import handleSetMusicChannel from '../commands/setmusicchannel';
import handleVolume from '../commands/volume';

// interaction 이벤트 핸들러 및 slash 명령 실행
export async function registerCommands(client: Client, interaction?: Interaction) {
    if (!interaction) return;
    if (interaction.isChatInputCommand()) {
        const command = interaction.commandName;
        try {
            switch (command) {
                case 'play':
                    await handlePlay(interaction as CommandInteraction, client);
                    break;
                case 'pause':
                    await handlePause(interaction as CommandInteraction, client);
                    break;
                case 'resume':
                    await handleResume(interaction as CommandInteraction, client);
                    break;
                case 'stop':
                    await handleStop(interaction as CommandInteraction, client);
                    break;
                case 'skip':
                    await handleSkip(interaction as CommandInteraction, client);
                    break;
                case 'queue':
                    await handleQueue(interaction as CommandInteraction);
                    break;
                case 'setmusicchannel':
                    await handleSetMusicChannel(interaction as CommandInteraction);
                    break;
                case 'volume':
                    await handleVolume(interaction as CommandInteraction);
                    break;
                default:
                    await interaction.reply({ content: '알 수 없는 명령어입니다.', ephemeral: true });
            }
        } catch (error) {
            console.error('[interactionHandler] 핸들러 오류:', error);
            if ('isRepliable' in interaction && interaction.isRepliable() && !interaction.replied) {
                try { await interaction.reply('명령 처리 중 오류가 발생했습니다.'); } catch {}
            }
        }
    } else if (interaction.isButton()) {
        // 버튼 인터랙션 처리 (customId로 분기)
        const { customId } = interaction;
        const guildId = interaction.guildId!;
        try {
            switch (customId) {
                case 'music_pause_resume': {
                    const player = client.lavalink.players.get(guildId);
                    if (player) {
                        if (player.paused) {
                            player.pause(false);
                            await interaction.reply({ content: '▶️ 음악을 다시 재생합니다.', ephemeral: true });
                        } else {
                            player.pause(true);
                            await interaction.reply({ content: '⏸️ 음악을 잠시 멈췄어요.', ephemeral: true });
                        }
                        const { updateMusicStatusEmbed } = require('../handlers/musicStatusEmbed');
                        await updateMusicStatusEmbed(client, guildId);
                    } else {
                        await interaction.reply({ content: '재생 중인 음악이 없습니다.', ephemeral: true });
                    }
                    break;
                }
                case 'music_stop': {
                    await handleStop(interaction as ButtonInteraction, client);
                    const { updateMusicStatusEmbed } = require('../handlers/musicStatusEmbed');
                    await updateMusicStatusEmbed(client, guildId);
                    break;
                }
                case 'music_skip': {
                    await handleSkip(interaction as ButtonInteraction, client);
                    const { updateMusicStatusEmbed } = require('../handlers/musicStatusEmbed');
                    await updateMusicStatusEmbed(client, guildId);
                    break;
                }
                case 'music_queue': {
                    await handleQueue(interaction as ButtonInteraction);
                    break;
                }
                default:
                    await interaction.reply({ content: '알 수 없는 버튼입니다.', ephemeral: true });
            }
        } catch (error) {
            console.error('[interactionHandler] 버튼 핸들러 오류:', error);
            if ('isRepliable' in interaction && interaction.isRepliable() && !interaction.replied) {
                try { await interaction.reply('버튼 처리 중 오류가 발생했습니다.'); } catch {}
            }
        }
    }
}
