const dotenv = require('dotenv');
const ffmpeg = require('@ffmpeg-installer/ffmpeg');
process.env.FFMPEG_PATH = ffmpeg.path;

const { SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const ytdlp = require('yt-dlp-exec');
const { FFmpeg } = require('prism-media');
const { PassThrough } = require('stream');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('음악을 재생합니다.')
    .addStringOption(option =>
      option.setName('url')
        .setDescription('재생할 유튜브 URL')
        .setRequired(true)),
  async execute(interaction) {
    await interaction.deferReply(); // 응답 지연을 알림
    
    const url = interaction.options.getString('url');
    const voiceChannel = interaction.member.voice.channel;

    if (!voiceChannel) {
      return interaction.editReply('먼저 음성 채널에 참가해주세요.');
    }

    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: interaction.guild.id,
      adapterCreator: interaction.guild.voiceAdapterCreator,
    });

    try {
      const info = await ytdlp(url, {
        dumpSingleJson: true,
        noWarnings: true,
        noCheckCertificate: true,
        preferFreeFormats: true,
        format: 'bestaudio',
      });

      const stream = ytdlp.exec(url, {
        format: 'bestaudio',
        output: '-',
      });

      // FFmpeg 스트림 설정 변경
      const ffmpegStream = new FFmpeg({
        args: [
          '-analyzeduration', '0',
          '-loglevel', '0',
          '-f', 's16le',
          '-ar', '48000',
          '-ac', '2',
        ],
        shell: process.platform === 'win32',
        ffmpegPath: ffmpeg.path
      }).on('error', error => {
        console.error('FFmpeg 오류:', error);
      });

      // ytdlp 스트림을 FFmpeg로 파이프
      const passThrough = new PassThrough();
      stream.stdout.pipe(ffmpegStream).pipe(passThrough);

      const resource = createAudioResource(passThrough, { inputType: 'ogg/opus', inlineVolume: true });

      const player = createAudioPlayer();

      player.play(resource);
      connection.subscribe(player);

      player.on(AudioPlayerStatus.Idle, () => {
        connection.destroy();
      });

      player.on('error', error => {
        console.error('오디오 플레이어 오류:', error);
        connection.destroy();
      });

      await interaction.editReply(`🎶 지금 재생 중: **${info.title}**`);
    } catch (error) {
      console.error('재생 중 오류:', error);
      connection.destroy();
      await interaction.editReply('재생 중 오류가 발생했습니다.');
    }
  },
};