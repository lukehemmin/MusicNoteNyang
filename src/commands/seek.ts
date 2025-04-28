import { CommandInteraction, ButtonInteraction } from 'discord.js';
import { MusicUtils } from '../utils/music';
import { autoUpdateMusicStatusEmbed } from '../handlers/musicStatusEmbed';
import { getYtDlpAudioUrl } from '../utils/yt-dlp';
import { createAudioResource, AudioPlayerStatus } from '@discordjs/voice';
import { getGuildVolume } from '../db/volume.repository';
import { updateHistorySeekAndExpire } from '../db/musicHistory.repository';
import { saveResumeState } from '../db/resumeState.repository';
import { spawn } from 'child_process';
import { StreamType } from '@discordjs/voice';
import { getCustomFfmpegPath } from '../utils/ffmpeg-path';

export default async function handleSeek(interaction: CommandInteraction, client: any) {
    const guildId = interaction.guildId!;
    const nowPlaying = MusicUtils['nowPlaying'].get(guildId);
    
    // 슬래시 커맨드에서 options 가져오기
    let seekTime = 0;
    try {
        // @ts-ignore - 런타임에 정상 작동함
        seekTime = Number(interaction.options.get('초')?.value) || 0;
    } catch (e) {
        console.error('seek 옵션 파싱 오류:', e);
    }
    
    if (!nowPlaying) {
        await interaction.reply({
            embeds: [{
                color: 0x95a5a6,
                description: '⏳ 시간을 이동할 곡이 없어요. `/play`로 음악을 먼저 재생해 주세요!'
            }]
        });
        return;
    }
    
    // 음수 시간 체크
    if (seekTime < 0) {
        await interaction.reply({
            embeds: [{
                color: 0xe74c3c,
                description: '⚠️ 0초 이상의 시간을 입력해 주세요!'
            }]
        });
        return;
    }
    
    // 곡 길이 체크
    const duration = 'info' in nowPlaying.track && nowPlaying.track.info && typeof nowPlaying.track.info.length === 'number' 
        ? nowPlaying.track.info.length / 1000 // Lavalink는 ms 단위
        : 0;
    
    if (duration > 0 && seekTime > duration) {
        await interaction.reply({
            embeds: [{
                color: 0xe74c3c, 
                description: `⚠️ 곡 길이(${MusicUtils.formatTime(duration)})보다 큰 시간으로 이동할 수 없어요!`
            }]
        });
        return;
    }
    
    await interaction.deferReply();
    
    try {
        // Lavalink 플레이어 확인
        const player = client.lavalink?.players.get(guildId);
        
        // yt-dlp 오디오 플레이어 확인
        const isYtDlpPlaying = nowPlaying?.audioPlayer !== undefined;
        
        if (player) {
            // Lavalink 플레이어로 시간 이동
            player.seek(seekTime * 1000); // seekTime을 ms 단위로 변환
            
            // 시크 정보 업데이트
            nowPlaying.seek = seekTime * 1000;
            
            // ResumeState 테이블에도 seek 위치 저장
            const query = 'query' in nowPlaying.track ? nowPlaying.track.query! : MusicUtils.getTrackUrl(nowPlaying.track);
            const title = MusicUtils.getTrackTitle(nowPlaying.track);
            try {
                await saveResumeState({
                    guildId,
                    // @ts-ignore - 런타임에 정상 작동함
                    voiceChannelId: interaction.member?.voice?.channel?.id || '',
                    textChannelId: interaction.channelId,
                    trackUrl: query,
                    title,
                    requestedBy: nowPlaying.requestedBy,
                    seekTime,
                    startedAt: new Date()
                });
            } catch (error) {
                console.error('ResumeState 저장 오류:', error);
            }
            
            await interaction.editReply({
                embeds: [{
                    color: 0x3498db,
                    description: `⏩ ${MusicUtils.formatTime(seekTime)}로 이동했어요!`
                }]
            });
        } else if (isYtDlpPlaying && nowPlaying.audioPlayer) {
            // URL과 제목 가져오기
            const query = 'query' in nowPlaying.track ? nowPlaying.track.query! : MusicUtils.getTrackUrl(nowPlaying.track);
            const title = MusicUtils.getTrackTitle(nowPlaying.track);
            
            // 사용자에게 먼저 진행 중임을 알림
            await interaction.editReply({
                embeds: [{
                    color: 0x3498db,
                    description: `🔄 **${title}**의 ${MusicUtils.formatTime(seekTime)} 위치로 준비 중...\n(음악은 계속 재생되다가 준비가 완료되면 전환됩니다)`
                }]
            });
            
            // 시크 정보 업데이트
            nowPlaying.seek = seekTime * 1000;
            
            // ResumeState 테이블에도 seek 위치 저장
            try {
                await saveResumeState({
                    guildId,
                    // @ts-ignore - 런타임에 정상 작동함
                    voiceChannelId: interaction.member?.voice?.channel?.id || '',
                    textChannelId: interaction.channelId,
                    trackUrl: query,
                    title,
                    requestedBy: nowPlaying.requestedBy,
                    seekTime,
                    startedAt: new Date()
                });
            } catch (error) {
                console.error('ResumeState 저장 오류:', error);
            }
            
            // 기존 음악은 계속 재생 (일시 중지하지 않음)
            // 백그라운드에서 새 오디오 URL 가져오기 (seekTime 지정)
            getYtDlpAudioUrl(query, seekTime).then(async (audioUrl) => {
                if (!audioUrl) {
                    await interaction.editReply({
                        embeds: [{
                            color: 0xe74c3c,
                            description: '⚠️ 오디오 스트림을 다시 추출하지 못했어요. 다시 시도해 주세요!'
                        }]
                    });
                    return;
                }
                
                // 이제 새 URL이 준비되었으므로 기존 플레이어 일시 중지
                if (nowPlaying.audioPlayer) {
                    nowPlaying.audioPlayer.pause();
                }
                
                // 새 오디오 리소스 생성 (ffmpeg로 seek 적용)
                const ffmpegPath = process.env.FFMPEG_PATH || getCustomFfmpegPath() || 'ffmpeg';
                const ffmpegArgs = ['-ss', seekTime.toString(), '-i', audioUrl, '-analyzeduration', '0', '-loglevel', '0', '-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1'];
                const ffmpegProc = spawn(ffmpegPath, ffmpegArgs, { stdio: ['ignore', 'pipe', 'ignore'] });
                const resource = createAudioResource(ffmpegProc.stdout, { inputType: StreamType.Raw, inlineVolume: true });
                
                // 볼륨 설정
                const volume = await getGuildVolume(guildId);
                if (volume && resource.volume) {
                    resource.volume.setVolume(volume / 100);
                }
                
                // seek 정보 업데이트
                nowPlaying.seek = seekTime * 1000;
                
                // 같은 플레이어로 새 리소스 재생
                nowPlaying.audioResource = resource;
                nowPlaying.audioPlayer.play(resource);
                
                // DB에 seek 위치 저장
                if (nowPlaying.historyId) {
                    await updateHistorySeekAndExpire(
                        nowPlaying.historyId,
                        seekTime,
                        new Date(Date.now() + 1000 * 60 * 60 * 24 * 7), // 7일
                        query
                    );
                }
                
                // ResumeState 테이블에도 seek 위치 저장
                try {
                    await saveResumeState({
                        guildId,
                        // @ts-ignore - 런타임에 정상 작동함
                        voiceChannelId: interaction.member?.voice?.channel?.id || '',
                        textChannelId: interaction.channelId,
                        trackUrl: query,
                        title,
                        requestedBy: nowPlaying.requestedBy,
                        seekTime,
                        startedAt: new Date()
                    });
                } catch (error) {
                    console.error('ResumeState 저장 오류:', error);
                }
                
                await interaction.editReply({
                    embeds: [{
                        color: 0x2ecc71,
                        description: `⏩ **${title}**의 ${MusicUtils.formatTime(seekTime)}로 이동 완료!`
                    }]
                });
                
                // 음악 상태 메시지 업데이트
                await autoUpdateMusicStatusEmbed(client, guildId);
            }).catch(async (error) => {
                console.error('Seek URL 가져오기 중 오류:', error);
                await interaction.editReply({
                    embeds: [{
                        color: 0xe74c3c,
                        description: '⚠️ 시간 이동 중 오류가 발생했어요. 다시 시도해 주세요!'
                    }]
                });
            });
            
        } else {
            await interaction.editReply({
                embeds: [{
                    color: 0xe74c3c,
                    description: '⚠️ 현재 재생 중인 플레이어를 찾을 수 없어요. 다시 시도해 주세요!'
                }]
            });
            
            // 음악 상태 메시지 업데이트
            await autoUpdateMusicStatusEmbed(client, guildId);
        }
    } catch (error) {
        console.error('Seek 명령어 처리 중 오류:', error);
        await interaction.editReply({
            embeds: [{
                color: 0xe74c3c,
                description: '⚠️ 시간 이동 중 오류가 발생했어요. 다시 시도해 주세요!'
            }]
        });
    }
} 