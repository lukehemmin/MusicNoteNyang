import discord
from discord import app_commands
from discord.ext import commands
from dotenv import load_dotenv
import os
import asyncio
import signal
import platform
import wavelink
from lavalink import NodeManager, MusicPlayer
from commands import setup_music_commands

load_dotenv()

class MusicBot(commands.Bot):
    def __init__(self):
        super().__init__(
            command_prefix="!",
            intents=discord.Intents.all()
        )
        self._cleanup_done = False
        self._ready = asyncio.Event()
        self.loop = asyncio.get_event_loop()
        self.active_command_names = []
    
    async def setup(self):
        """봇 초기 설정"""
        print("봇 초기 설정을 시작합니다...")
        self.node_manager = NodeManager(self)
        self.music_player = MusicPlayer(self)
        
        # 명령어 설정
        print("슬래시 명령어를 설정합니다...")
        self.active_command_names.extend(setup_music_commands(self))
        
        print("초기 설정이 완료되었습니다.")
    
    async def sync_commands(self):
        """슬래시 명령어 동기화"""
        print("슬래시 명령어 동기화를 시작합니다...")
        
        # 기존 명령어 가져오기
        current_commands = await self.tree.fetch_commands()
        
        # 사용하지 않는 명령어 삭제
        for cmd in current_commands:
            if cmd.name not in self.active_command_names:
                print(f"사용하지 않는 명령어 삭제: /{cmd.name}")
                await self.tree.remove_command(cmd.name)
        
        # 명령어 동기화
        await self.tree.sync()
        print("슬래시 명령어 동기화가 완료되었습니다.")
        print(f"활성화된 명령어 목록: {', '.join(f'/{name}' for name in self.active_command_names)}")
    
    async def setup_hook(self):
        """봇 시작 시 호출되는 설정 훅"""
        await self.setup()
        await self.sync_commands()
    
    async def on_ready(self):
        """봇이 준비되었을 때 호출되는 이벤트"""
        print(f'봇이 {self.user} 계정으로 로그인했습니다!')
        # Lavalink 노드 연결
        await self.node_manager.connect_nodes()
        self._ready.set()
        print("봇이 완전히 준비되었습니다!")
    
    async def cleanup(self):
        """봇 종료 시 정리 작업"""
        if not self._cleanup_done:
            print("\n봇을 종료합니다...")
            # 모든 음성 채널에서 연결 해제
            for voice_client in self.voice_clients:
                try:
                    await voice_client.disconnect(force=True)
                except:
                    pass
            
            # Lavalink 연결 해제
            try:
                await wavelink.Pool.disconnect()
                print("Lavalink 연결이 해제되었습니다.")
            except:
                pass
            
            # 봇 종료
            try:
                await self.close()
                print("봇이 안전하게 종료되었습니다.")
            except:
                pass
            
            self._cleanup_done = True

async def shutdown(bot, signal=None):
    """봇 종료 처리"""
    if signal:
        print(f"\n{signal} 시그널을 받았습니다.")
    await bot.cleanup()

async def main():
    # 환경 변수 확인
    token = os.getenv('DISCORD_TOKEN')
    client_id = os.getenv('DISCORD_CLIENT_ID')
    
    if not token:
        raise ValueError("DISCORD_TOKEN이 .env 파일에 설정되어 있지 않습니다!")
    if not client_id:
        raise ValueError("DISCORD_CLIENT_ID가 .env 파일에 설정되어 있지 않습니다!")
    
    bot = MusicBot()
    
    # Windows에서의 Ctrl+C 처리
    if platform.system() == 'Windows':
        signal.signal(signal.SIGINT, lambda s, f: asyncio.create_task(shutdown(bot, "Ctrl+C")))
    
    try:
        print("봇을 시작합니다...")
        print("Ctrl+C로 안전하게 종료할 수 있습니다.")
        await bot.start(token)
    except KeyboardInterrupt:
        await shutdown(bot)
    except Exception as e:
        print(f"봇 실행 중 오류가 발생했습니다: {e}")
    finally:
        await asyncio.sleep(1)

if __name__ == "__main__":
    asyncio.run(main()) 