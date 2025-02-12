from discord import app_commands
import discord
import re
import wavelink

def is_youtube_url(url: str) -> bool:
    """유튜브 URL인지 확인"""
    youtube_regex = r'(https?://)?(www\.)?(youtube|youtu|youtube-nocookie)\.(com|be)/(watch\?v=|embed/|v/|.+\?v=)?([^&=%\?]{11})'
    return bool(re.match(youtube_regex, url))

def setup_music_commands(bot):
    """음악 관련 명령어 설정"""
    
    @bot.tree.command(
        name="재생",
        description="유튜브에서 음악을 검색하여 재생합니다"
    )
    @app_commands.describe(
        검색어="유튜브 URL이나 검색어를 입력하세요"
    )
    async def play(interaction: discord.Interaction, 검색어: str):
        # 사용자가 음성 채널에 있는지 확인
        if not interaction.user.voice:
            await interaction.response.send_message("❌ 음성 채널에 먼저 입장해주세요!", ephemeral=True)
            return
        
        # 검색 시작 메시지
        await interaction.response.defer(thinking=True)
        
        try:
            # 음악 검색
            if is_youtube_url(검색어):
                # URL인 경우 직접 검색
                search_query = 검색어
            else:
                # 검색어로 검색
                search_query = f"ytsearch:{검색어}"
            
            # 트랙 검색
            tracks = await wavelink.Playable.search(search_query)
            
            if not tracks:
                await interaction.followup.send("❌ 검색 결과를 찾을 수 없습니다.")
                return
            
            track = tracks[0]
            
            # 음성 채널 연결
            if not interaction.guild.voice_client:
                vc: wavelink.Player = await interaction.user.voice.channel.connect(cls=wavelink.Player)
            else:
                vc: wavelink.Player = interaction.guild.voice_client
            
            # 음악 재생
            await vc.play(track)
            
            # 재생 정보 임베드 생성
            embed = discord.Embed(
                title="🎵 재생 시작",
                color=discord.Color.green()
            )
            embed.add_field(
                name="제목",
                value=f"[{track.title}]({track.uri})",
                inline=False
            )
            embed.add_field(
                name="길이",
                value=f"{int(track.length//60)}:{int(track.length%60):02d}",
                inline=True
            )
            embed.add_field(
                name="채널",
                value=interaction.user.voice.channel.name,
                inline=True
            )
            
            await interaction.followup.send(embed=embed)
            
        except Exception as e:
            await interaction.followup.send(f"❌ 음악 재생 중 오류가 발생했습니다: {str(e)}")
            raise e  # 디버깅을 위해 오류 상세 정보 출력
    
    @bot.tree.command(name="정지", description="음악을 정지하고 대기열을 초기화합니다")
    async def stop(interaction: discord.Interaction):
        # 음성 채널 연결 확인
        if not interaction.guild.voice_client:
            await interaction.response.send_message("❌ 재생 중인 음악이 없습니다.", ephemeral=True)
            return
        
        # 사용자가 음성 채널에 있는지 확인
        if not interaction.user.voice:
            await interaction.response.send_message("❌ 음성 채널에 먼저 입장해주세요!", ephemeral=True)
            return
        
        # 같은 음성 채널에 있는지 확인
        if interaction.guild.voice_client.channel != interaction.user.voice.channel:
            await interaction.response.send_message("❌ 봇과 같은 음성 채널에 있어야 합니다!", ephemeral=True)
            return
        
        vc: wavelink.Player = interaction.guild.voice_client
        await vc.stop()
        await vc.disconnect()
        
        embed = discord.Embed(
            title="⏹️ 재생 정지",
            description="음악 재생을 정지하고 대기열을 초기화했습니다.",
            color=discord.Color.red()
        )
        await interaction.response.send_message(embed=embed)
    
    @bot.tree.command(name="일시정지", description="음악을 일시정지하거나 다시 재생합니다")
    async def pause(interaction: discord.Interaction):
        # 음성 채널 연결 확인
        if not interaction.guild.voice_client:
            await interaction.response.send_message("❌ 재생 중인 음악이 없습니다.", ephemeral=True)
            return
        
        # 사용자가 음성 채널에 있는지 확인
        if not interaction.user.voice:
            await interaction.response.send_message("❌ 음성 채널에 먼저 입장해주세요!", ephemeral=True)
            return
        
        # 같은 음성 채널에 있는지 확인
        if interaction.guild.voice_client.channel != interaction.user.voice.channel:
            await interaction.response.send_message("❌ 봇과 같은 음성 채널에 있어야 합니다!", ephemeral=True)
            return
        
        vc: wavelink.Player = interaction.guild.voice_client
        
        if vc.is_paused():
            await vc.resume()
            embed = discord.Embed(
                title="▶️ 재생 재개",
                description="일시정지를 해제했습니다.",
                color=discord.Color.green()
            )
        else:
            await vc.pause()
            embed = discord.Embed(
                title="⏸️ 일시정지",
                description="재생을 일시정지했습니다.",
                color=discord.Color.yellow()
            )
        
        await interaction.response.send_message(embed=embed)
    
    @bot.tree.command(name="재개", description="일시정지된 음악을 다시 재생합니다")
    async def resume(interaction: discord.Interaction):
        # 음성 채널 연결 확인
        if not interaction.guild.voice_client:
            await interaction.response.send_message("❌ 재생 중인 음악이 없습니다.", ephemeral=True)
            return
        
        # 사용자가 음성 채널에 있는지 확인
        if not interaction.user.voice:
            await interaction.response.send_message("❌ 음성 채널에 먼저 입장해주세요!", ephemeral=True)
            return
        
        # 같은 음성 채널에 있는지 확인
        if interaction.guild.voice_client.channel != interaction.user.voice.channel:
            await interaction.response.send_message("❌ 봇과 같은 음성 채널에 있어야 합니다!", ephemeral=True)
            return
        
        vc: wavelink.Player = interaction.guild.voice_client
        
        if not vc.is_paused():
            await interaction.response.send_message("❌ 음악이 이미 재생 중입니다.", ephemeral=True)
            return
        
        await vc.resume()
        embed = discord.Embed(
            title="▶️ 재생 재개",
            description="일시정지를 해제했습니다.",
            color=discord.Color.green()
        )
        await interaction.response.send_message(embed=embed)
    
    @bot.tree.command(name="건너뛰기", description="현재 재생 중인 음악을 건너뜁니다")
    async def skip(interaction: discord.Interaction):
        # 음성 채널 연결 확인
        if not interaction.guild.voice_client:
            await interaction.response.send_message("❌ 재생 중인 음악이 없습니다.", ephemeral=True)
            return
        
        # 사용자가 음성 채널에 있는지 확인
        if not interaction.user.voice:
            await interaction.response.send_message("❌ 음성 채널에 먼저 입장해주세요!", ephemeral=True)
            return
        
        # 같은 음성 채널에 있는지 확인
        if interaction.guild.voice_client.channel != interaction.user.voice.channel:
            await interaction.response.send_message("❌ 봇과 같은 음성 채널에 있어야 합니다!", ephemeral=True)
            return
        
        vc: wavelink.Player = interaction.guild.voice_client
        
        if not vc.is_playing():
            await interaction.response.send_message("❌ 현재 재생 중인 음악이 없습니다.", ephemeral=True)
            return
        
        # 현재 재생 중인 트랙 정보 저장
        current_track = vc.current
        
        # 음악 건너뛰기
        await vc.stop()
        
        embed = discord.Embed(
            title="⏭️ 건너뛰기",
            description=f"[{current_track.title}]({current_track.uri}) 을(를) 건너뛰었습니다.",
            color=discord.Color.blue()
        )
        await interaction.response.send_message(embed=embed)
    
    return ["재생", "정지", "일시정지", "재개", "건너뛰기"]  # 등록된 명령어 이름 목록 반환 