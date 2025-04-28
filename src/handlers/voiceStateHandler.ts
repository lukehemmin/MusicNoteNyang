import { Client, VoiceState } from 'discord.js';
import { MusicUtils } from '../utils/music';
import handleStop from '../commands/stop';

// 봇이 음성 채널에서 나가거나 유저가 모두 나갔을 때 큐/상태 정리
export default async function voiceStateHandler(client: Client, oldState: VoiceState, newState: VoiceState) {
    const guild = oldState.guild;
    const botId = client.user?.id;
    const botVoiceState = guild.members.me?.voice;
    // 봇이 음성채널에 남아있는지 체크
    if (!botVoiceState?.channel) {
        // 큐/상태 정리 및 stop 호출
        await handleStop({
            guildId: guild.id,
            reply: async () => {},
            deferReply: async () => {},
            followUp: async () => {},
            editReply: async () => {},
            isRepliable: () => false,
            client
        } as any, client);
        MusicUtils['queues'].delete(guild.id);
        MusicUtils['nowPlaying'].delete(guild.id);
    }
}
