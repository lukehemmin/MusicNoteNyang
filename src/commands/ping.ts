import { SlashCommandBuilder, CommandInteraction } from 'discord.js';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('봇의 응답 속도를 확인합니다'),
  
  async execute(interaction: CommandInteraction): Promise<void> {
    // 먼저 응답 보내기
    await interaction.reply({ content: '핑을 측정하는 중...' });
    
    // 응답 메시지 가져오기
    const response = await interaction.fetchReply();
    const pingLatency = response.createdTimestamp - interaction.createdTimestamp;
    
    await interaction.editReply(
      `봇 지연 시간: ${pingLatency}ms\nAPI 지연 시간: ${Math.round(interaction.client.ws.ping)}ms`
    );
  },
}; 