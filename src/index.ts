import * as fs from 'fs';
import * as path from 'path';
import { execSync, spawn } from 'child_process';
const rootDir = path.resolve(__dirname, '../..');
const binDir = path.join(rootDir, 'ffmpeg', 'bin');
const exeName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
const ffmpegExe = path.join(binDir, exeName);
const sep = process.platform === 'win32' ? ';' : ':';

// ffmpeg 경로 자동 탐색 및 환경변수 설정 보완 (utils/ffmpeg-path.ts 활용)
import { getCustomFfmpegPath } from './utils/ffmpeg-path';

const FFMPEG_PATH = getCustomFfmpegPath();

function getFfmpegPath() {
  return process.env.FFMPEG_PATH || FFMPEG_PATH;
}

// 디버깅: ffmpeg 경로와 환경변수 상태 출력
console.log('[디버깅] binDir:', binDir);
console.log('[디버깅] ffmpegExe:', ffmpegExe);
console.log('[디버깅] fs.existsSync(ffmpegExe):', fs.existsSync(ffmpegExe));
console.log('[디버깅] process.env.PATH:', process.env.PATH);
console.log('[디버깅] process.env.FFMPEG_PATH:', process.env.FFMPEG_PATH);
console.log('[디버깅] getFfmpegPath():', getFfmpegPath());

const detectedFfmpeg = getCustomFfmpegPath();
if (detectedFfmpeg) {
  process.env.FFMPEG_PATH = detectedFfmpeg;
  process.env.FFMPEG_BIN = detectedFfmpeg;
}

function checkDependency(cmd: string, name: string) {
  const envKey = `${name.toUpperCase()}_PATH`;
  const execCmd = (name === 'ffmpeg') ? getFfmpegPath() : (process.env[envKey] || cmd);
  try {
    console.log(`[디버깅] checkDependency 실행: ${execCmd} --version`);
    const env = { ...process.env, LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' };
    const result = execSync(`${execCmd} --version`, { stdio: 'pipe', env });
    const output = result.toString();
    if (output.includes('version')) {
      console.log(`[환경체크] ${name} 정상 동작 확인됨.`);
    } else {
      console.warn(`[환경체크] ${name} 버전 정보 확인 실패. 출력:\n${output}`);
    }
  } catch (e: any) {
    const stderr = e.stderr?.toString() || '';
    if (stderr.includes("Unrecognized option '-version'")) {
      console.warn(`[경고] ${execCmd} 실행 시 -version 옵션 관련 경고가 발생했으나, ffmpeg는 정상적으로 설치되어 있습니다.`);
    } else {
      console.error(`[환경체크] ${name}가 설치되어 있지 않습니다. 설치 후 다시 시도하세요.`);
      console.error('[디버깅] execSync 에러:', e);
      process.exit(1);
    }
  }
}

// 봇 시작 시 의존성 체크
checkDependency('yt-dlp', 'yt-dlp');
checkDependency('ffmpeg', 'ffmpeg');

import { deleteExpiredHistories } from './db/musicHistory.repository';

import { config } from 'dotenv';
import { Client, GatewayIntentBits, Interaction, CommandInteraction, SlashCommandBuilder, ChannelType } from 'discord.js';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import { LavalinkManager } from 'lavalink-client';

import { getResumeState, clearResumeState, saveResumeState } from './db/resumeState.repository';
import { getGuildVolume } from './db/volume.repository';
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  getVoiceConnection,
  StreamType
} from '@discordjs/voice';

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

import handleVolume from './commands/volume';

// 명령어 등록
const commands = [
    new SlashCommandBuilder().setName('play').setDescription('음악을 재생합니다.').addStringOption(opt => opt.setName('query').setDescription('유튜브 URL 또는 검색어').setRequired(true)),
    new SlashCommandBuilder().setName('pause').setDescription('음악을 일시정지합니다.'),
    new SlashCommandBuilder().setName('resume').setDescription('일시정지된 음악을 다시 재생합니다.'),
    new SlashCommandBuilder().setName('skip').setDescription('현재 곡을 건너뜁니다.'),
    new SlashCommandBuilder().setName('stop').setDescription('재생을 중지하고 큐를 초기화합니다.'),
    new SlashCommandBuilder().setName('queue').setDescription('현재 대기열을 확인합니다.'),
    new SlashCommandBuilder().setName('nowplaying').setDescription('현재 재생 중인 곡을 확인합니다.'),
    new SlashCommandBuilder().setName('음악채널지정').setDescription('음악 상태 메시지를 보낼 텍스트 채널을 지정합니다.').addChannelOption(opt => opt.setName('채널').setDescription('음악 상태 메시지를 보낼 텍스트 채널').addChannelTypes(ChannelType.GuildText).setRequired(true)),
    new SlashCommandBuilder().setName('seek').setDescription('재생 중인 음악의 시간을 이동합니다.').addIntegerOption(opt => opt.setName('초').setDescription('이동할 시간(초)').setRequired(true)),
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

// 명령어 캐시 파일 경로
const COMMANDS_CACHE_PATH = path.join(__dirname, '../commands_cache.json');

// 고급 명령어 동기화 함수: 변경된 명령어만 부분적으로 등록/수정/삭제
async function syncCommands() {
    try {
        // 명령어 정의 리스트 (JSON)
        const definedList = commands.map(cmd => cmd.toJSON());
        const definedMap = new Map(definedList.map((cmd: any) => [cmd.name, cmd]));
        
        // 1. 캐시된 명령어 확인 (이전 실행 시 저장한 명령어 상태)
        let cachedCommands = [];
        let shouldSyncWithDiscord = false;
        try {
            if (fs.existsSync(COMMANDS_CACHE_PATH)) {
                const cacheData = fs.readFileSync(COMMANDS_CACHE_PATH, 'utf8');
                cachedCommands = JSON.parse(cacheData);
                
                // 캐시와 현재 정의 비교
                const cachedMap = new Map(cachedCommands.map((cmd: any) => [cmd.name, cmd]));
                
                // 변경 여부 확인 (이름, 설명, 옵션 등)
                for (const def of definedList) {
                    const cached = cachedMap.get(def.name);
                    if (!cached) {
                        // 새 명령어
                        console.log(`[명령어 캐시] 새 명령어 감지: ${def.name}`);
                        shouldSyncWithDiscord = true;
                        break;
                    }
                    
                    // 내용 비교 (간소화된 비교)
                    const defStr = JSON.stringify(def);
                    const cachedStr = JSON.stringify(cached);
                    if (defStr !== cachedStr) {
                        console.log(`[명령어 캐시] 명령어 변경 감지: ${def.name}`);
                        shouldSyncWithDiscord = true;
                        break;
                    }
                }
                
                // 삭제된 명령어 확인
                for (const cached of cachedCommands) {
                    if (!definedMap.has(cached.name)) {
                        console.log(`[명령어 캐시] 삭제된 명령어 감지: ${cached.name}`);
                        shouldSyncWithDiscord = true;
                        break;
                    }
                }
                
                // 변경이 없으면 Discord API 호출 생략
                if (!shouldSyncWithDiscord) {
                    console.log('[명령어 캐시] 명령어가 이미 최신 상태입니다. Discord API 호출을 생략합니다.');
                    return;
                }
            } else {
                // 캐시 파일이 없으면 무조건 동기화
                shouldSyncWithDiscord = true;
                console.log('[명령어 캐시] 캐시 파일이 없습니다. 전체 명령어를 동기화합니다.');
            }
        } catch (e) {
            // 캐시 파일 읽기 실패 시 전체 동기화
            shouldSyncWithDiscord = true;
            console.error('[명령어 캐시] 캐시 파일 읽기 오류:', e);
        }
        
        // 2. Discord API와 동기화 필요한 경우만 수행
        if (shouldSyncWithDiscord) {
            // 현재 등록된 명령어 목록 조회
            const currentCommands = await rest.get(Routes.applicationCommands(CLIENT_ID));
            const currentList = Array.isArray(currentCommands) ? currentCommands : [];
            const currentMap = new Map(currentList.map((cmd: any) => [cmd.name, cmd]));
            
            let changed = false;
            
            // 삭제: 코드에 없는 명령어는 삭제
            for (const cmd of currentList) {
                if (!definedMap.has(cmd.name)) {
                    await rest.delete(Routes.applicationCommand(CLIENT_ID, cmd.id));
                    console.log(`[명령어 삭제] ${cmd.name}`);
                    changed = true;
                }
            }
            
            // 추가/수정
            for (const def of definedList) {
                const cur = currentMap.get(def.name);
                if (!cur) {
                    // 새 명령어
                    await rest.post(Routes.applicationCommands(CLIENT_ID), { body: def });
                    console.log(`[명령어 추가] ${def.name}`);
                    changed = true;
                } else {
                    // 수정 필요 여부 확인(간단 비교)
                    const curStr = JSON.stringify({ ...cur, id: undefined, application_id: undefined, version: undefined, default_member_permissions: undefined });
                    const defStr = JSON.stringify(def);
                    if (curStr !== defStr) {
                        await rest.patch(Routes.applicationCommand(CLIENT_ID, cur.id), { body: def });
                        console.log(`[명령어 수정] ${def.name}`);
                        changed = true;
                    }
                }
            }
            
            if (changed) {
                console.log('명령어가 변경된 부분만 동기화 완료!');
            } else {
                console.log('명령어가 이미 최신 상태입니다.');
            }
            
            // 3. 현재 명령어 상태를 캐시 파일로 저장
            try {
                fs.writeFileSync(COMMANDS_CACHE_PATH, JSON.stringify(definedList, null, 2), 'utf8');
                console.log('[명령어 캐시] 명령어 상태 캐시 파일 업데이트 완료');
            } catch (e) {
                console.error('[명령어 캐시] 캐시 파일 저장 오류:', e);
            }
        }
    } catch (error) {
        console.error('명령어 동기화 실패:', error);
    }
}

// 명령어 동적 로드
import handlePlay from './commands/play';
import handlePause from './commands/pause';
import handleResume from './commands/resume';
import handleSkip from './commands/skip';
import handleStop from './commands/stop';
import handleQueue from './commands/queue';
import handleNowPlaying from './commands/nowplaying';
import handleSetMusicChannel from './commands/setmusicchannel';
import handleSeek from './commands/seek';

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

// interaction 이벤트 핸들러 및 버튼 컨트롤 처리
client.on('interactionCreate', async (interaction: Interaction) => {
    try {
        // 슬래시 커맨드 처리
        if (interaction.isChatInputCommand()) {
            const command = interaction.commandName;
            const commandHandlers: Record<string, (interaction: CommandInteraction, client: any) => Promise<void>> = {
                play: handlePlay,
                pause: handlePause,
                resume: handleResume,
                skip: handleSkip,
                stop: handleStop,
                queue: handleQueue,
                nowplaying: handleNowPlaying,
                음악채널지정: handleSetMusicChannel,
                volume: handleVolume,
                seek: handleSeek
            };
            const handler = commandHandlers[command];
            if (!handler) return;
            await handler(interaction as CommandInteraction, client);
            // 음악 embed 메시지 항상 갱신
            const { updateMusicStatusEmbed } = require('./handlers/musicStatusEmbed');
            await updateMusicStatusEmbed(client, interaction.guildId!);
            return;
        }
        // 버튼 인터랙션 처리
        if (interaction.isButton()) {
            const guildId = interaction.guildId!;
            const { updateMusicStatusEmbed } = require('./handlers/musicStatusEmbed');
            switch (interaction.customId) {
                case 'music_pause_resume': {
                    // 현재 상태에 따라 pause/resume 분기
                    const player = client.lavalink.players.get(guildId);
                    if (player) {
                        if (player.paused) {
                            player.pause(false);
                            await interaction.reply({ content: '▶️ 음악을 다시 재생합니다.', ephemeral: true });
                        } else {
                            player.pause(true);
                            await interaction.reply({ content: '⏸️ 음악을 일시정지합니다.', ephemeral: true });
                        }
                        await updateMusicStatusEmbed(client, guildId);
                    } else {
                        await interaction.reply({ content: '재생 중인 음악이 없습니다.', ephemeral: true });
                    }
                    break;
                }
                case 'music_stop': {
                    const stop = require('./commands/stop').default;
                    await stop({ ...interaction, isButton: true } as any, client);
                    await updateMusicStatusEmbed(client, guildId);
                    break;
                }
                case 'music_skip': {
                    const skip = require('./commands/skip').default;
                    await skip({ ...interaction, isButton: true } as any, client);
                    await updateMusicStatusEmbed(client, guildId);
                    break;
                }
                case 'music_queue': {
                    const queue = require('./commands/queue').default;
                    await queue({ ...interaction, isButton: true } as any);
                    break;
                }
                default:
                    await interaction.reply({ content: '알 수 없는 버튼입니다.', ephemeral: true });
            }
            return;
        }
    } catch (error) {
        console.error('[interactionCreate] 핸들러 오류:', error);
        if ('isRepliable' in interaction && (interaction as any).isRepliable() && !(interaction as any).replied) {
            try { await (interaction as any).reply('명령 처리 중 오류가 발생했습니다.'); } catch {}
        }
    }
});

// 자동 재접속
client.on('voiceStateUpdate', async (oldState, newState) => {
    const guild = newState.guild;
    const botId = client.user?.id;
    const channel = newState.channel || oldState.channel;
    if (!channel || !botId) return;
    // 봇이 해당 채널에 있는지 확인
    const botMember = channel.members.get(botId);
    if (!botMember) return;
    // 사람이 한 명도 없고 봇만 남은 경우
    const userCount = channel.members.filter(m => !m.user.bot).size;
    if (userCount === 0) {
        // 이미 타이머 있으면 중복 실행 방지
        if (voiceIdleTimers.has(guild.id)) return;
        // 음악 일시정지
        const np = require('./utils/music').nowPlaying.get(guild.id);
        if (np && np.audioPlayer && typeof np.audioPlayer.pause === 'function') {
            np.audioPlayer.pause();
        }
        // 안내 메시지(embed 등)도 갱신 필요시 호출
        try {
            const { updateMusicStatusEmbed } = require('./handlers/musicStatusEmbed');
            await updateMusicStatusEmbed(client, guild.id);
        } catch {}
        // 2시간 대기 후 자동 정리
        const timer = setTimeout(async () => {
            // 아직도 사람이 없으면 정리
            const ch = guild.channels.cache.get(channel.id);
            if (ch && (ch as any).members.filter((m: any) => !m.user.bot).size === 0) {
                // 음악 중지 및 큐/nowPlaying 삭제
                const stop = require('./commands/stop').default;
                await stop({ guildId: guild.id, reply: async () => {} } as any, client);
                // 안내 embed도 갱신
                try {
                    const { updateMusicStatusEmbed } = require('./handlers/musicStatusEmbed');
                    await updateMusicStatusEmbed(client, guild.id);
                } catch {}
            }
            voiceIdleTimers.delete(guild.id);
        }, VOICE_IDLE_LIMIT);
        voiceIdleTimers.set(guild.id, timer);
    } else {
        // 사람이 다시 들어오면 타이머 해제 및 음악 재개
        if (voiceIdleTimers.has(guild.id)) {
            clearTimeout(voiceIdleTimers.get(guild.id));
            voiceIdleTimers.delete(guild.id);
            // 음악 재개
            const np = require('./utils/music').nowPlaying.get(guild.id);
            if (np && np.audioResource) {
                await saveResumeState({
                    guildId: guild.id,
                    voiceChannelId: np.audioResource.metadata?.channelId || '',
                    textChannelId: '',
                    trackUrl: np.track?.query || np.track?.url || '',
                    title: np.track?.title || '',
                    requestedBy: np.requestedBy,
                    seekTime: Math.floor(np.audioResource.playbackDuration / 1000),
                    startedAt: new Date()
                });
            }
            // 안내 embed 갱신
            try {
                const { updateMusicStatusEmbed } = require('./handlers/musicStatusEmbed');
                await updateMusicStatusEmbed(client, guild.id);
            } catch {}
        }
    }
});

const voiceIdleTimers: Map<string, NodeJS.Timeout> = new Map();
const VOICE_IDLE_LIMIT = 2 * 60 * 60 * 1000; // 2시간(ms)

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
    await gracefulShutdown();
    // 명시적으로 프로세스 종료
    process.exit(0);
});

// 핫 리로딩을 위한 안전한 종료 함수
async function gracefulShutdown() {
    try {
        console.log('\n[서버 종료] 안전하게 종료 중...');
        
        // 안전 타임아웃 설정 (5초 후 강제 종료)
        const forceExitTimeout = setTimeout(() => {
            console.log('[서버 종료] 타임아웃 - 강제 종료합니다.');
            process.exit(1);
        }, 5000);
        
        // === 재생 상태 최신화 ===
        const { MusicUtils } = require('./utils/music');
        const nowPlaying = (MusicUtils as any).nowPlaying;
        const abortPendingProcess = MusicUtils.abortPendingProcess;
        // 중단된 모든 프로세스 kill
        for (const guildId of nowPlaying.keys()) {
            abortPendingProcess(guildId);
        }
        // 저장된 seek ms를 기준으로 ResumeState 업데이트
        for (const [guildId, np] of nowPlaying.entries()) {
            if (np && typeof np.seek === 'number') {
                await saveResumeState({
                    guildId,
                    voiceChannelId: np.audioResource?.metadata?.channelId || '',
                    textChannelId: '',
                    trackUrl: np.track?.query || np.track?.url || '',
                    title: np.track?.title || '',
                    requestedBy: np.requestedBy,
                    seekTime: Math.floor(np.seek / 1000),
                    startedAt: new Date()
                });
            }
        }
        // Lavalink 연결 해제
        if (client.lavalink) {
            for (const player of client.lavalink.players.values()) {
                player.destroy();
            }
            await new Promise(res => setTimeout(res, 500)); // 잠깐 대기
        }
        // Discord 클라이언트 종료
        await client.destroy();
        
        // 타임아웃 취소 (정상 종료됨)
        clearTimeout(forceExitTimeout);
        
        console.log('[서버 종료] 모든 연결 해제 완료.');
    } catch (e) {
        console.error('[서버 종료] 에러:', e);
    }
}

// 핫 리로딩을 위한 SIGUSR2 처리 (nodemon이 사용하는 시그널)
// process.once('SIGUSR2', async () => {
//     console.log('\n[핫 리로딩] 안전하게 상태 저장 중...');
//     await gracefulShutdown();
    
//     // 5초 이내에 종료되지 않으면 강제 종료
//     const forceKillTimeout = setTimeout(() => {
//         console.log('[핫 리로딩] 타임아웃 - 강제로 프로세스를 종료합니다.');
//         process.kill(process.pid, 'SIGUSR2');
//     }, 5000);
    
//     // 정상적으로 종료 신호 전달
//     clearTimeout(forceKillTimeout);
//     process.kill(process.pid, 'SIGUSR2');
// });

import { initDb } from './db';
import { ensureMusicChannelTables } from './db/musicChannelTables';

(async () => {
  await initDb();
  await ensureMusicChannelTables();
  client.once('ready', async () => {
    console.log(`${client.user?.tag} 봇이 준비되었습니다.`);
    await syncCommands();
    client.lavalink.init(client.user?.id!);

    // === 서버 재시작 시 ResumeState 기반 자동 복구 ===
    const guilds = client.guilds.cache;
    for (const [guildId, guild] of guilds) {
      console.log(`[resume] ${guild.name} 서버 자동 재생 시도 중...`);
      const resume = await getResumeState(guildId);
      if (resume && resume.voiceChannelId && resume.trackUrl) {
        try {
          console.log(`[resume] ${guild.name}의 재생 정보: ${resume.title || '알 수 없는 곡'} (URL: ${resume.trackUrl.substring(0, 100)}...)`);
          
          // 보이스 채널 확인
          const voiceChannel = await guild.channels.fetch(resume.voiceChannelId);
          if (!voiceChannel) {
            console.error(`[resume] ${guild.name}: 보이스 채널을 찾을 수 없음 (ID: ${resume.voiceChannelId})`);
            await clearResumeState(guildId);
            continue;
          }
          
          if (voiceChannel.type !== 2) {
            console.error(`[resume] ${guild.name}: 음성 채널이 아님 (타입: ${voiceChannel.type})`);
            await clearResumeState(guildId);
            continue;
          }
          
          console.log(`[resume] ${guild.name}: 보이스 채널 ${voiceChannel.name} 연결 시도`);
          
          // 연결 상태 확인
          const existingConnection = getVoiceConnection(guildId);
          if (existingConnection) {
            console.log(`[resume] ${guild.name}: 기존 연결 종료 후 재연결`);
            existingConnection.destroy();
            await new Promise(r => setTimeout(r, 1000)); // 연결 완전히 종료 대기
          }
          
          // 새 연결 시도
          const connection = joinVoiceChannel({
            channelId: resume.voiceChannelId,
            guildId: guildId,
            adapterCreator: (voiceChannel as any).guild.voiceAdapterCreator,
            selfDeaf: true
          });
          
          // URL 유효성 검사
          if (!resume.trackUrl.startsWith('http')) {
            console.error(`[resume] ${guild.name}: 유효하지 않은 URL (${resume.trackUrl})`);
            await clearResumeState(guildId);
            connection.destroy();
            continue;
          }
          
          console.log(`[resume] ${guild.name}: 오디오 플레이어 및 리소스 생성 중`);
          const player = createAudioPlayer();
          
          try {
            // 원본 오디오 스트림 URL을 가져오고, ffmpeg로 seek 처리
            const { getYtDlpAudioUrl } = await import('./utils/yt-dlp');
            
            // URL에서 타임스탬프 파라미터(t=)가 있는지 확인하고 추출
            let timeParam = 0;
            try {
              const urlObj = new URL(resume.trackUrl);
              // youtube.com 또는 youtu.be 형식 처리
              if (urlObj.searchParams.has('t')) {
                timeParam = parseInt(urlObj.searchParams.get('t') || '0');
                console.log(`[resume] ${guild.name}: URL에 포함된 시작 위치: ${timeParam}초`);
              }
            } catch (err) {
              console.error(`[resume] ${guild.name}: URL 파싱 오류:`, err);
            }
            
            // 재생 위치 결정: 마지막 듣던 위치(resume.seekTime)가 있으면 그것을 사용, 없으면 URL 타임스탬프 사용
            const finalSeekTime = resume.seekTime > 0 ? resume.seekTime : timeParam;
            
            if (resume.seekTime > 0) {
              console.log(`[resume] ${guild.name}: 마지막 듣던 위치인 ${resume.seekTime}초부터 재생합니다.`);
            } else if (timeParam > 0) {
              console.log(`[resume] ${guild.name}: URL에 지정된 위치인 ${timeParam}초부터 재생합니다.`);
            } else {
              console.log(`[resume] ${guild.name}: 처음부터 재생합니다.`);
            }
            
            // YT-DLP로 기본 오디오 스트림 URL만 가져옴
            const audioStreamUrl = await getYtDlpAudioUrl(resume.trackUrl, 0);
            
            if (!audioStreamUrl) {
              console.error(`[resume] ${guild.name}: 오디오 스트림 URL 가져오기 실패`);
              await clearResumeState(guildId);
              // 음성 연결 유지
              continue;
            }
            
            // ffmpeg로 seek 처리 및 raw PCM 출력 (reconnect 옵션 포함)
            const ffmpegPath = process.env.FFMPEG_PATH || getCustomFfmpegPath() || 'ffmpeg';
            const ffmpegArgs = [
                '-reconnect', '1',
                '-reconnect_streamed', '1',
                '-reconnect_at_eof', '1',
                '-ss', finalSeekTime.toString(),
                '-i', audioStreamUrl,
                '-analyzeduration', '0',
                '-loglevel', '0',
                '-f', 's16le',
                '-ar', '48000',
                '-ac', '2',
                'pipe:1'
            ];
            const ffmpegProc = spawn(ffmpegPath, ffmpegArgs, { stdio: ['ignore', 'pipe', 'ignore'] });
            const resource = createAudioResource(ffmpegProc.stdout, { inputType: StreamType.Raw, inlineVolume: true });
            
            if (!resource) {
              console.error(`[resume] ${guild.name}: 리소스 생성 실패`);
              await clearResumeState(guildId);
              connection.destroy();
              continue;
            }
            
            if (resource.volume) {
              const volume = await getGuildVolume(guildId) || 50;
              resource.volume.setVolume(volume / 100);
              console.log(`[resume] ${guild.name}: 볼륨 설정 (${volume}%)`);
            }
            
            // nowPlaying 맵에 현재 재생 정보 설정 - seek 명령어에서 사용
            const { MusicUtils } = require('./utils/music');
            (MusicUtils as any).nowPlaying.set(guildId, {
                track: { 
                    title: resume.title || '제목 없음', 
                    query: resume.trackUrl 
                },
                requestedBy: resume.requestedBy || '알 수 없음',
                audioPlayer: player,
                audioResource: resource,
                seek: finalSeekTime * 1000 // ms 단위로 변환하여 저장
            });
            
            // 오디오 플레이어 이벤트 설정
            player.on('error', async (error) => {
              console.error(`[resume] ${guild.name} 플레이어 오류:`, error);
              await clearResumeState(guildId);
              // 연결은 유지
              (MusicUtils as any).nowPlaying.set(guildId, null);
            });
            
            player.on(AudioPlayerStatus.Idle, async () => {
              console.log(`[resume] ${guild.name}: 재생 완료`);
              await clearResumeState(guildId);
              // 음성 연결 유지
              (MusicUtils as any).nowPlaying.set(guildId, null);
            });
            
            // 연결 에러 처리
            connection.on('error', (error) => {
              console.error(`[resume] ${guild.name} 연결 오류:`, error);
              // 음성 연결 유지
            });
            
            // 연결 이벤트 처리
            connection.on('stateChange', (oldState, newState) => {
              console.log(`[resume] ${guild.name} 연결 상태 변경: ${oldState.status} -> ${newState.status}`);
            });
            
            // 재생 시간 주기적으로 저장 (30초마다)
            let currentPlayTime = finalSeekTime;
            const playTimeUpdater = setInterval(async () => {
                if (player.state.status === AudioPlayerStatus.Playing) {
                    currentPlayTime += 30; // 30초씩 증가
                    console.log(`[resume] ${guild.name}: 재생 시간 업데이트 - ${currentPlayTime}초`);
                    
                    // DB에 현재 재생 시간 저장
                    await saveResumeState({
                        guildId,
                        voiceChannelId: resume.voiceChannelId,
                        textChannelId: resume.textChannelId,
                        trackUrl: resume.trackUrl,
                        title: resume.title,
                        requestedBy: resume.requestedBy,
                        seekTime: currentPlayTime,
                        startedAt: new Date()
                    });
                    
                    // nowPlaying 정보도 업데이트
                    const np = (MusicUtils as any).nowPlaying.get(guildId);
                    if (np) {
                        np.seek = currentPlayTime * 1000; // ms 단위로 변환
                    }
                }
            }, 30000); // 30초마다 실행
            
            // 플레이어가 끝나면 타이머 정리
            player.on(AudioPlayerStatus.Idle, () => {
                clearInterval(playTimeUpdater);
            });
            
            // 에러 발생 시 타이머 정리
            player.on('error', () => {
                clearInterval(playTimeUpdater);
            });
            
            // 재생 시작
            connection.subscribe(player);
            player.play(resource);
            console.log(`[resume] ${guild.name}에서 마지막 곡 자동 재생 시작`);
          } catch (resourceError) {
            console.error(`[resume] ${guild.name} 리소스 생성/재생 오류:`, resourceError);
            // 음성 연결 유지
            await clearResumeState(guildId);
          }
        } catch (e) {
          console.error(`[resume] ${guild.name} 자동 재생 실패:`, e);
          await clearResumeState(guildId);
        }
      } else {
        if (resume) {
          console.log(`[resume] ${guild.name}: 불완전한 재생 정보 (voiceChannelId: ${resume.voiceChannelId || '없음'}, trackUrl: ${resume.trackUrl ? '있음' : '없음'})`);
        } else {
          console.log(`[resume] ${guild.name}: 재생 정보 없음`);
        }
      }
    }
  });

  client.login(TOKEN);

  // fetch가 글로벌에 없으면 node-fetch polyfill
  // @ts-ignore
  if (typeof fetch === 'undefined') {
    // node-fetch v3+는 ESM only이므로 require 대신 동적 import 사용
    (globalThis as any).fetch = function() {
      return import('node-fetch').then(mod => mod.default.apply(null, arguments as any));
    };
  }

  // 콘솔에서 'restart' 또는 're' 명령어 입력 시 재시작 지원
  process.stdin.on('data', (data) => {
    const input = data.toString().trim().toLowerCase();
    if (input === 'restart' || input === 're') {
      console.log('\n[커스텀 명령어] 재시작 명령을 감지했습니다. 프로세스를 재시작합니다...');
      
      // 실행 환경 감지 (nodemon vs ts-node)
      const isNodemon = process.env.npm_lifecycle_script?.includes('nodemon');
      
      if (isNodemon) {
        // nodemon 환경: 기존 로직 사용
        gracefulShutdown().then(() => {
          console.log('[재시작] 안전하게 상태 저장 완료, 재시작 중...');
          // nodemon에서 인식하는 'rs' 명령 시뮬레이션
          process.stdout.write('rs\n');
        }).catch((err) => {
          console.error('[재시작] 상태 저장 중 오류 발생:', err);
          // 오류가 발생해도 재시작 시도
          process.stdout.write('rs\n');
        });
      } else {
        // ts-node 직접 실행 환경: 직접 프로세스 재시작
        gracefulShutdown().then(() => {
          console.log('[재시작] 안전하게 상태 저장 완료, 재시작 중...');
          
          // ts-node로 재시작
          const { spawn } = require('child_process');
          
          // npx ts-node src/index.ts 명령어로 재시작
          const child = spawn('npx', ['ts-node', 'src/index.ts'], {
            detached: true,
            stdio: 'inherit',
            shell: true
          });
          
          // 현재 프로세스 종료
          child.unref();
          process.exit(0);
        }).catch((err) => {
          console.error('[재시작] 상태 저장 중 오류 발생:', err);
          process.exit(1);
        });
      }
    }
  });

  // music_history 만료 기록 주기적 삭제
  setInterval(async () => {
    try {
      await deleteExpiredHistories();
      // console.log('[music_history] 만료 기록 삭제 완료');
    } catch (e) {
      console.error('[music_history] 만료 기록 삭제 오류:', e);
    }
  }, 10 * 60 * 1000); // 10분

})();
