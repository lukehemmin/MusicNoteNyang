import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, Interaction, CommandInteraction, GuildMember, PermissionsBitField } from 'discord.js';
import { config } from 'dotenv';
import { LavalinkManager } from 'lavalink-client';

config();

const TOKEN = process.env.BOT_TOKEN!;
const CLIENT_ID = process.env.CLIENT_ID!;
const LAVALINK_HOST = process.env.LAVALINK_HOST!;
const LAVALINK_PORT = process.env.LAVALINK_PORT!;
const LAVALINK_PASSWORD = process.env.LAVALINK_PASSWORD!;

if (!TOKEN || !CLIENT_ID || !LAVALINK_HOST || !LAVALINK_PORT || !LAVALINK_PASSWORD) {
    throw new Error('환경 변수(.env)가 올바르게 설정되어 있는지 확인하세요.');
}

// 타입 확장: Client에 lavalink 속성 추가 (TypeScript 오류 해결)
declare module 'discord.js' {
  interface Client {
    lavalink: any;
  }
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages
    ]
});

// LavalinkManager 인스턴스 생성
client.lavalink = new LavalinkManager({
    nodes: [
        {
            authorization: LAVALINK_PASSWORD,
            host: LAVALINK_HOST,
            port: Number(LAVALINK_PORT),
            id: 'main',
            retryAmount: 9999,
            retryDelay: 5000,
        }
    ],
    sendToShard: (guildId: string, payload: any) => {
        const guild = client.guilds.cache.get(guildId);
        if (guild) guild.shard.send(payload);
    },
    client: {
        id: CLIENT_ID,
        username: 'MusicNoteNyang',
    },
    autoSkip: true,
    autoSkipOnResolveError: true,
    emitNewSongsOnly: true,
    playerOptions: {
        onDisconnect: {
            autoReconnect: true,
            destroyPlayer: false
        },
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

// 명령어 동적 로드
import handlePlay from './commands/play';
import handlePause from './commands/pause';
import handleResume from './commands/resume';
import handleSkip from './commands/skip';
import handleStop from './commands/stop';
import handleQueue from './commands/queue';
import handleNowPlaying from './commands/nowplaying';

// 명령어 동기화 함수: 기존 등록 명령어와 코드 정의 명령어가 다르면 모두 삭제 후 재등록
async function syncCommands() {
    try {
        const currentCommands = await rest.get(Routes.applicationCommands(CLIENT_ID));
        const currentList = Array.isArray(currentCommands) ? currentCommands : [];
        // 코드 기준 명령어(이름, 설명)만 추출
        const definedList = commands.map(cmd => ({
            name: cmd.name,
            description: cmd.description,
            options: cmd.options?.map((opt: any) => ({
                type: opt.type,
                name: opt.name,
                description: opt.description,
                required: opt.required
            })) || []
        }));
        // 변경 여부 체크
        let needUpdate = false;
        if (currentList.length !== definedList.length) {
            needUpdate = true;
        } else {
            for (let i = 0; i < currentList.length; ++i) {
                const a = currentList[i];
                const b = definedList.find(c => c.name === a.name);
                if (!b || a.description !== b.description) {
                    needUpdate = true;
                    break;
                }
            }
        }
        if (needUpdate) {
            // 기존 명령어 모두 삭제
            for (const cmd of currentList) {
                await rest.delete(Routes.applicationCommand(CLIENT_ID, cmd.id));
            }
            // 새로 등록
            await rest.put(
                Routes.applicationCommands(CLIENT_ID),
                { body: commands.map(cmd => cmd.toJSON()) }
            );
            console.log('명령어가 변경되어 모두 재등록 완료!');
        } else {
            console.log('명령어가 이미 최신 상태입니다.');
        }
    } catch (error) {
        console.error('명령어 동기화 실패:', error);
    }
}

// 음악 큐 관리 (길드별 큐)
interface QueueItem {
    track: any;
    requestedBy: string;
}
const queues: Map<string, QueueItem[]> = new Map();
const nowPlaying: Map<string, QueueItem | null> = new Map();

// 유틸: lavalink REST API로 트랙 검색
async function searchTracks(query: string): Promise<any[]> {
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

// 전역 예외 처리: 서버 다운 방지
process.on('unhandledRejection', (reason, promise) => {
    console.error('[unhandledRejection] 예기치 않은 오류:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('[uncaughtException] 예기치 않은 오류:', err);
});

client.on('interactionCreate', async (interaction: Interaction) => {
    try {
        if (!interaction.isChatInputCommand()) return;
        const command = interaction.commandName;
        switch (command) {
            case 'play':
                await handlePlay(interaction as CommandInteraction);
                break;
            case 'pause':
                await handlePause(interaction as CommandInteraction, client);
                break;
            case 'resume':
                await handleResume(interaction as CommandInteraction, client);
                break;
            case 'skip':
                await handleSkip(interaction as CommandInteraction, client);
                break;
            case 'stop':
                await handleStop(interaction as CommandInteraction, client);
                break;
            case 'queue':
                await handleQueue(interaction as CommandInteraction);
                break;
            case 'nowplaying':
                await handleNowPlaying(interaction as CommandInteraction);
                break;
        }
    } catch (error) {
        console.error('[interactionCreate] 핸들러 오류:', error);
        // 응답이 가능한 경우만 reply 시도
        if ('isRepliable' in interaction && (interaction as any).isRepliable() && !(interaction as any).replied) {
            try { await (interaction as any).reply('명령 처리 중 오류가 발생했습니다.'); } catch {}
        }
    }
});

function playNext(guildId: string, voiceChannelId: string, interaction: CommandInteraction | null) {
    const queue = queues.get(guildId) || [];
    if (!queue.length) {
        nowPlaying.set(guildId, null);
        if (interaction) interaction.followUp('대기열이 비었습니다.');
        return;
    }
    const item = queue.shift()!;
    nowPlaying.set(guildId, item);
    queues.set(guildId, queue);
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
        playNext(guildId, voiceChannelId, null);
    });
}

// 자동 재접속
client.on('voiceStateUpdate', (oldState, newState) => {
    const player = client.lavalink.players.get(oldState.guild.id);
    if (!player) return;
    if (oldState.channelId && !newState.channelId && oldState.member?.id === client.user?.id) {
        setTimeout(() => {
            player.connect();
        }, 1000);
    }
});

// Lavalink 연결 상태 및 재연결 로직
let lavalinkReconnectTimeout: NodeJS.Timeout | null = null;
let lavalinkReconnectDelay = 10; // 재연결 시도 간격(초)

client.lavalink.on('connect', (node: any) => {
    if (lavalinkReconnectTimeout) {
        clearTimeout(lavalinkReconnectTimeout);
        lavalinkReconnectTimeout = null;
    }
    lavalinkReconnectDelay = 10;
    console.log(`[Lavalink] 노드 연결 완료: ${node.options.host}:${node.options.port}`);
});

client.lavalink.on('disconnect', (node: any, reason: any) => {
    console.warn(`[Lavalink] 노드 연결 해제: ${node.options.host}:${node.options.port} (사유: ${reason})`);
    attemptLavalinkReconnect(node);
});

client.lavalink.on('error', (node: any, error: any) => {
    console.error(`[Lavalink] 연결 오류: ${node.options.host}:${node.options.port}`, error);
    attemptLavalinkReconnect(node);
});

function attemptLavalinkReconnect(node: any) {
    if (lavalinkReconnectTimeout) return; // 이미 재연결 대기 중이면 중복 시도 방지
    lavalinkReconnectTimeout = setTimeout(async () => {
        console.log(`[Lavalink] ${lavalinkReconnectDelay}초 후 재연결 시도 중...`);
        try {
            await node.connect();
            console.log('[Lavalink] 재연결 성공!');
            lavalinkReconnectDelay = 10;
        } catch (e) {
            console.error('[Lavalink] 재연결 실패:', e);
            lavalinkReconnectDelay = Math.min(lavalinkReconnectDelay * 2, 120); // 최대 2분까지 증가
            attemptLavalinkReconnect(node); // 재귀 재시도
        } finally {
            lavalinkReconnectTimeout = null;
        }
    }, lavalinkReconnectDelay * 1000);
}

// 안전한 종료: Ctrl+C(SIGINT) 시 모든 연결 해제 및 프로세스 종료
process.on('SIGINT', async () => {
    try {
        console.log('\n[서버 종료] 안전하게 종료 중...');
        // Lavalink 연결 해제
        if (client.lavalink) {
            for (const player of client.lavalink.players.values()) {
                player.destroy();
            }
            await new Promise(res => setTimeout(res, 500)); // 잠깐 대기
        }
        // Discord 클라이언트 종료
        await client.destroy();
        console.log('[서버 종료] 모든 연결 해제 완료.');
    } catch (e) {
        console.error('[서버 종료] 에러:', e);
    } finally {
        process.exit(0);
    }
});

client.once('ready', async () => {
    console.log(`${client.user?.tag} 봇이 준비되었습니다.`);
    await syncCommands();
    client.lavalink.init(client.user?.id!);
});

client.login(TOKEN);

// fetch polyfill (node 18+ 내장, 하위 호환용)
// @ts-ignore
if (typeof fetch === 'undefined') global.fetch = (...args: any[]) => import('node-fetch').then(({default: fetch}) => fetch(...args));
