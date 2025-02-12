const { SlashCommandBuilder } = require('discord.js');
const { getVoiceConnection } = require('@discordjs/voice');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leave')
    .setDescription('음성 채널을 떠납니다.'),
  async execute(interaction) {
    const connection = getVoiceConnection(interaction.guild.id);

    if (!connection) {
      return interaction.reply('봇이 음성 채널에 없거나 연결되어 있지 않습니다.');
    }

    connection.destroy();
    await interaction.reply('음성 채널을 떠났습니다.');
  },
}; 