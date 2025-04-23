import { CommandInteraction } from 'discord.js';

export interface QueueItem {
    track: any;
    requestedBy: string;
}

export const queues: Map<string, QueueItem[]> = new Map();
export const nowPlaying: Map<string, QueueItem | null> = new Map();

export async function searchTracks(query: string): Promise<any[]> {
    const LAVALINK_HOST = process.env.LAVALINK_HOST!;
    const LAVALINK_PORT = process.env.LAVALINK_PORT!;
    const LAVALINK_PASSWORD = process.env.LAVALINK_PASSWORD!;
    const params = new URLSearchParams({
        identifier: query.startsWith('http') ? query : `ytsearch:${query}`
    });
    const url = `http://${LAVALINK_HOST}:${LAVALINK_PORT}/v4/loadtracks?${params.toString()}`;
    const res = await fetch(url, {
        headers: { Authorization: LAVALINK_PASSWORD }
    });
    const data = await res.json();
    if (!data.tracks || data.tracks.length === 0) return [];
    return data.tracks;
}

export function playNext(guildId: string, voiceChannelId: string, interaction: CommandInteraction | null, client?: any) {
    const queue = queues.get(guildId) || [];
    if (!queue.length) {
        nowPlaying.set(guildId, null);
        if (interaction) interaction.followUp('대기열이 비었습니다.');
        return;
    }
    const item = queue.shift()!;
    nowPlaying.set(guildId, item);
    queues.set(guildId, queue);
    if (!client) return;
    let player = client.lavalink.players.get(guildId);
    if (!player) {
        player = client.lavalink.create({
            guildId,
            voiceId: voiceChannelId,
            textId: interaction ? interaction.channelId : undefined
        });
        player.connect();
    }
    player.play(item.track);
    player.once('start', () => {
        if (interaction) interaction.followUp(`재생 중: **${item.track.info.title}**`);
    });
    player.once('end', () => {
        playNext(guildId, voiceChannelId, null, client);
    });
}
