import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, Interaction, CommandInteraction, GuildMember } from 'discord.js';
import { config } from 'dotenv';
import { joinVoiceChannel, getVoiceConnection, VoiceConnectionStatus, AudioPlayerStatus, createAudioPlayer, createAudioResource, entersState } from '@discordjs/voice';
import { Manager, NodeOptions, Track, Player } from 'lavalink-client';
import path from 'path';
import fs from 'fs';

config();

const TOKEN = process.env.BOT_TOKEN!;
const CLIENT_ID = process.env.CLIENT_ID!;
const GUILD_ID = process.env.GUILD_ID!;
const LAVALINK_HOST = process.env.LAVALINK_HOST!;
const LAVALINK_PORT = process.env.LAVALINK_PORT!;
const LAVALINK_PASSWORD = process.env.LAVALINK_PASSWORD!;

if (!TOKEN || !CLIENT_ID || !GUILD_ID || !LAVALINK_HOST || !LAVALINK_PORT || !LAVALINK_PASSWORD) {
    throw new Error('환경 변수(.env)가 올바르게 설정되어 있는지 확인하세요.');
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages
    ]
});

// Lavalink 설정
const lavalinkOptions: NodeOptions = {
    host: LAVALINK_HOST,
    port: Number(LAVALINK_PORT),
    password: LAVALINK_PASSWORD,
    identifier: 'main',
    retryAmount: 9999,
    retryDelay: 5000,
};

const manager = new Manager({
    nodes: [lavalinkOptions],
    send: (id, payload) => {
        const guild = client.guilds.cache.get(id);
        if (guild) guild.shard.send(payload);
    },
});

// 명령어 등록
const commands = [
    new SlashCommandBuilder().setName('play').setDescription('음악을 재생합니다.').addStringOption(opt => opt.setName('query').setDescription('URL 또는 검색어').setRequired(true)),
    new SlashCommandBuilder().setName('pause').setDescription('음악을 일시정지합니다.'),
    new SlashCommandBuilder().setName('resume').setDescription('음악을 다시 재생합니다.'),
    new SlashCommandBuilder().setName('skip').setDescription('현재 곡을 스킵합니다.'),
    new SlashCommandBuilder().setName('stop').setDescription('재생을 중지하고 큐를 초기화합니다.'),
    new SlashCommandBuilder().setName('queue').setDescription('현재 대기열을 확인합니다.'),
    new SlashCommandBuilder().setName('nowplaying').setDescription('현재 재생 중인 곡을 확인합니다.'),
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

async function registerCommands() {
    try {
        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands.map(cmd => cmd.toJSON()) }
        );
        console.log('슬래시 명령어 등록 완료');
    } catch (error) {
        console.error('명령어 등록 실패:', error);
    }
}

// 음악 큐 및 상태 관리
interface QueueItem {
    track: Track;
    requestedBy: string;
}
const queue: QueueItem[] = [];
let currentPlayer: Player | null = null;
let nowPlaying: QueueItem | null = null;

// 봇 명령어 처리
client.on('interactionCreate', async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const command = interaction.commandName;
    const member = interaction.member as GuildMember;
    const voiceChannel = member.voice.channel;

    if (["play", "pause", "resume", "skip", "stop", "queue", "nowplaying"].includes(command) && !voiceChannel) {
        await interaction.reply({ content: '음성 채널에 먼저 접속해주세요.', ephemeral: true });
        return;
    }

    switch (command) {
        case 'play':
            await handlePlay(interaction, voiceChannel.id, member.id);
            break;
        case 'pause':
            await handlePause(interaction);
            break;
        case 'resume':
            await handleResume(interaction);
            break;
        case 'skip':
            await handleSkip(interaction, member.id);
            break;
        case 'stop':
            await handleStop(interaction);
            break;
        case 'queue':
            await handleQueue(interaction);
            break;
        case 'nowplaying':
            await handleNowPlaying(interaction);
            break;
    }
});

// 각 명령어 핸들러 구현 (아래는 play 예시, 나머지도 비슷하게 구현 필요)
async function handlePlay(interaction: CommandInteraction, voiceChannelId: string, userId: string) {
    const query = interaction.options.get('query', true).value as string;
    await interaction.deferReply();
    let tracks: Track[] = [];
    let searchResult;
    try {
        if (query.startsWith('http')) {
            searchResult = await manager.search(query, interaction.user);
        } else {
            searchResult = await manager.search({ query, source: 'ytsearch' }, interaction.user);
        }
        tracks = searchResult.tracks;
    } catch (err) {
        await interaction.editReply('검색 또는 재생에 실패했습니다.');
        return;
    }
    if (!tracks.length) {
        await interaction.editReply('검색 결과가 없습니다.');
        return;
    }
    const track = tracks[0];
    queue.push({ track, requestedBy: userId });
    await interaction.editReply(`대기열에 추가됨: **${track.info.title}**`);
    if (!nowPlaying) playNext(interaction.guildId!, voiceChannelId, interaction);
}

async function playNext(guildId: string, voiceChannelId: string, interaction: CommandInteraction | null) {
    if (queue.length === 0) {
        nowPlaying = null;
        if (interaction) await interaction.followUp('대기열이 비었습니다.');
        return;
    }
    const item = queue.shift()!;
    nowPlaying = item;
    let player = manager.players.get(guildId);
    if (!player) {
        player = manager.create({ guildId, voiceId: voiceChannelId, textId: interaction ? interaction.channelId : undefined });
        player.connect();
    }
    player.play(item.track);
    player.once('start', () => {
        if (interaction) interaction.followUp(`재생 중: **${item.track.info.title}**`);
    });
    player.once('end', () => {
        playNext(guildId, voiceChannelId, null);
    });
}

async function handlePause(interaction: CommandInteraction) {
    const player = manager.players.get(interaction.guildId!);
    if (!player || !player.playing) {
        await interaction.reply('재생 중인 곡이 없습니다.');
        return;
    }
    player.pause(true);
    await interaction.reply('일시정지되었습니다.');
}

async function handleResume(interaction: CommandInteraction) {
    const player = manager.players.get(interaction.guildId!);
    if (!player || !player.paused) {
        await interaction.reply('일시정지된 곡이 없습니다.');
        return;
    }
    player.pause(false);
    await interaction.reply('다시 재생합니다.');
}

async function handleSkip(interaction: CommandInteraction, userId: string) {
    if (!nowPlaying) {
        await interaction.reply('재생 중인 곡이 없습니다.');
        return;
    }
    // 관리자 또는 요청자만 스킵 가능
    const isAdmin = interaction.memberPermissions?.has('Administrator');
    if (nowPlaying.requestedBy !== userId && !isAdmin) {
        await interaction.reply('현재 곡을 요청한 사용자 또는 관리자만 스킵할 수 있습니다.');
        return;
    }
    const player = manager.players.get(interaction.guildId!);
    if (player) player.stop();
    await interaction.reply('스킵되었습니다.');
}

async function handleStop(interaction: CommandInteraction) {
    const player = manager.players.get(interaction.guildId!);
    if (player) player.destroy();
    queue.length = 0;
    nowPlaying = null;
    await interaction.reply('재생을 중지하고 대기열을 초기화했습니다.');
}

async function handleQueue(interaction: CommandInteraction) {
    if (queue.length === 0) {
        await interaction.reply('대기열이 비어 있습니다.');
        return;
    }
    const desc = queue.map((item, i) => `${i + 1}. **${item.track.info.title}** (요청자: <@${item.requestedBy}>)`).join('\n');
    await interaction.reply(`대기열:\n${desc}`);
}

async function handleNowPlaying(interaction: CommandInteraction) {
    if (!nowPlaying) {
        await interaction.reply('현재 재생 중인 곡이 없습니다.');
        return;
    }
    await interaction.reply(`현재 재생 중: **${nowPlaying.track.info.title}** (요청자: <@${nowPlaying.requestedBy}>)`);
}

// 자동 재접속
client.on('voiceStateUpdate', (oldState, newState) => {
    const player = manager.players.get(oldState.guild.id);
    if (!player) return;
    if (oldState.channelId && !newState.channelId && oldState.member?.id === client.user?.id) {
        // 봇이 추방/연결 해제될 경우 자동 재접속
        setTimeout(() => {
            player.connect();
        }, 1000);
    }
});

client.once('ready', async () => {
    console.log(`${client.user?.tag} 봇이 준비되었습니다.`);
    await registerCommands();
    manager.init(client.user?.id!);
});

client.login(TOKEN);
