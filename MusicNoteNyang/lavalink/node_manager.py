import wavelink
from discord.ext import commands

class NodeManager:
    def __init__(self, bot: commands.Bot):
        self.bot = bot
    
    async def connect_nodes(self):
        """Lavalink 노드에 연결"""
        try:
            node = wavelink.Node(
                uri='http://192.168.0.86:2333',  # 실제 Lavalink 서버 주소로 변경
                password='youshallnotpass'
            )
            await wavelink.Pool.connect(nodes=[node], client=self.bot)
            print("Lavalink 노드에 성공적으로 연결되었습니다!")
        except Exception as e:
            print(f"Lavalink 노드 연결 실패: {e}") 