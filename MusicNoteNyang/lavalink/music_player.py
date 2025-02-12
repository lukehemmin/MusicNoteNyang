# lavalink/music_player.py
import wavelink
import discord

class MusicPlayer:
    def __init__(self, bot: discord.Client):
        self.bot = bot
    
    async def play_song(self, interaction: discord.Interaction, query: str):
        """음악 재생 처리"""
        # 사용자가 음성 채널에 있는지 확인
        if not interaction.user.voice:
            await interaction.response.send_message("음성 채널에 먼저 입장해주세요!")
            return
        
        # 음성 채널 가져오기
        voice_channel = interaction.user.voice.channel
        
        try:
            # 봇을 음성 채널에 연결
            player = await voice_channel.connect(cls=wavelink.Player)
            
            # 음악 검색
            search = await wavelink.Track.search(query)
            if not search:
                await interaction.response.send_message("검색 결과를 찾을 수 없습니다.")
                return
            
            track = search[0]
            
            # 음악 재생
            await player.play(track)
            
            embed = discord.Embed(
                title="🎵 재생 중",
                description=f"**{track.title}**\n길이: {int(track.length//60)}:{int(track.length%60):02d}",
                color=discord.Color.green()
            )
            await interaction.response.send_message(embed=embed)
            
        except Exception as e:
            await interaction.response.send_message(f"음악 재생 중 오류가 발생했습니다: {str(e)}")
