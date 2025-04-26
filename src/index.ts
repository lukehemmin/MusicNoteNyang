import * as path from 'path';
const rootDir = path.resolve(__dirname, '../..');
const ffmpegBin = path.join(rootDir, 'ffmpeg', 'bin');
const ffmpegExe = process.platform === 'win32'
  ? path.join(ffmpegBin, 'ffmpeg.exe')
  : path.join(ffmpegBin, 'ffmpeg');
const sep = process.platform === 'win32' ? ';' : ':';
if (!process.env.PATH?.startsWith(ffmpegBin)) {
  process.env.PATH = `${ffmpegBin}${sep}${process.env.PATH}`;
}
// ffmpeg 환경변수 강제 지정 부분 삭제 (시스템 PATH 자동 인식)
// process.env.FFMPEG_PATH = ffmpegExe;
// process.env.FFMPEG_BIN = ffmpegExe;

import { config } from 'dotenv';
import { Client, GatewayIntentBits, Interaction, CommandInteraction, SlashCommandBuilder, ChannelType } from 'discord.js';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import { LavalinkManager } from 'lavalink-client';

import { deleteExpiredHistories } from './db/musicHistory.repository';
import { getResumeState, clearResumeState, saveResumeState } from './db/resumeState.repository';
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  getVoiceConnection
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

import * as volumeModule from './commands/volume';

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
    volumeModule.volumeCommand,
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

// 고급 명령어 동기화 함수: 변경된 명령어만 부분적으로 등록/수정/삭제
async function syncCommands() {
    try {
        // 1. 현재 등록된 명령어 목록 조회
        const currentCommands = await rest.get(Routes.applicationCommands(CLIENT_ID));
        const currentList = Array.isArray(currentCommands) ? currentCommands : [];
        // 2. 코드 기준 명령어 목록(JSON)
        const definedList = commands.map(cmd => cmd.toJSON());
        // 3. 이름 기준 매핑
        const currentMap = new Map(currentList.map((cmd: any) => [cmd.name, cmd]));
        const definedMap = new Map(definedList.map((cmd: any) => [cmd.name, cmd]));
        let changed = false;
        // 4. 삭제: 코드에 없는 명령어는 삭제
        for (const cmd of currentList) {
            if (!definedMap.has(cmd.name)) {
                await rest.delete(Routes.applicationCommand(CLIENT_ID, cmd.id));
                console.log(`[명령어 삭제] ${cmd.name}`);
                changed = true;
            }
        }
        // 5. 추가/수정
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
            case '음악채널지정':
                await handleSetMusicChannel(interaction as CommandInteraction);
                break;
            case 'volume':
                await volumeModule.default(interaction as CommandInteraction);
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
            if (np && np.audioPlayer && typeof np.audioPlayer.unpause === 'function') {
                np.audioPlayer.unpause();
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
    try {
        console.log('\n[서버 종료] 안전하게 종료 중...');
        // === 재생 상태 최신화 ===
        const { nowPlaying } = require('./utils/music');
        for (const [guildId, np] of nowPlaying.entries()) {
            if (np && np.audioResource) {
                await saveResumeState({
                    guildId,
                    voiceChannelId: np.audioResource.metadata?.channelId || '',
                    textChannelId: '',
                    trackUrl: np.track?.query || np.track?.url || '',
                    title: np.track?.title || '',
                    requestedBy: np.requestedBy,
                    seekTime: Math.floor(np.audioResource.playbackDuration / 1000),
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
        console.log('[서버 종료] 모든 연결 해제 완료.');
    } catch (e) {
        console.error('[서버 종료] 에러:', e);
    } finally {
        process.exit(0);
    }
});

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
      const resume = await getResumeState(guildId);
      if (resume && resume.voiceChannelId && resume.trackUrl) {
        try {
          const voiceChannel = await guild.channels.fetch(resume.voiceChannelId);
          if (!voiceChannel || voiceChannel.type !== 2) continue;
          const connection = getVoiceConnection(guildId) || joinVoiceChannel({
            channelId: resume.voiceChannelId,
            guildId: guildId,
            adapterCreator: (voiceChannel as any).guild.voiceAdapterCreator
          });
          const player = createAudioPlayer();
          const resource = createAudioResource(resume.trackUrl, { inlineVolume: true });
          if (resource.volume) resource.volume.setVolume(0.5); // 기본값(볼륨 DB 연동 가능)
          player.on(AudioPlayerStatus.Idle, async () => {
            await clearResumeState(guildId);
            connection.destroy();
          });
          player.play(resource);
          connection.subscribe(player);
          console.log(`[resume] ${guild.name}에서 마지막 곡 자동 재생 시작`);
        } catch (e) {
          console.error(`[resume] 자동 재생 실패:`, e);
        }
      }
    }
  });

  client.login(TOKEN);

  // fetch polyfill (node 18+ 내장, 하위 호환용)
  // @ts-ignore
  if (typeof fetch === 'undefined') global.fetch = (...args: any[]) => import('node-fetch').then(({default: fetch}) => fetch(...args));

  // 10분마다 만료된 기록 삭제
  setInterval(async () => {
    try {
      await deleteExpiredHistories();
      // console.log('[music_history] 만료 기록 삭제 완료');
    } catch (e) {
      console.error('[music_history] 만료 기록 삭제 오류:', e);
    }
  }, 10 * 60 * 1000); // 10분
})();
