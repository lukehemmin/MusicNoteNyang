# lavalink/custom_player.py
import wavelink

class CustomPlayer(wavelink.Player):
    """대기열 기능이 추가된 커스텀 플레이어"""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.queue = []
        self._loop = False
        self._current = None
        
    @property
    def loop(self):
        """반복 재생 상태"""
        return self._loop
    
    @loop.setter
    def loop(self, value: bool):
        self._loop = value
    
    def is_playing(self):
        """현재 재생 중인지 확인"""
        return self.playing
    
    def is_paused(self):
        """현재 일시정지 상태인지 확인"""
        return self.paused
    
    @property
    def current(self):
        """현재 재생 중인 트랙"""
        return self._current
    
    async def play(self, track, **kwargs):
        """트랙 재생"""
        self._current = track
        await super().play(track, **kwargs)
    
    async def add_track(self, track):
        """대기열에 트랙 추가"""
        if not self.is_playing():
            await self.play(track)
        else:
            self.queue.append(track)
    
    async def play_next(self):
        """다음 트랙 재생"""
        # 현재 트랙을 반복 재생하는 경우
        if self.loop and self.current:
            await self.play(self.current)
            return
            
        # 대기열이 비어있으면 종료
        if not self.queue:
            self._current = None
            return
            
        # 다음 트랙 재생
        track = self.queue.pop(0)
        await self.play(track)
    
    async def stop(self):
        """재생 정지"""
        self._current = None
        await super().stop()
    
    async def skip(self):
        """현재 트랙 건너뛰기"""
        if not self.is_playing():
            return
            
        # 현재 트랙 정보 저장
        skipped = self.current
        
        # 다음 트랙으로 넘어가기
        await self.stop()
        await self.play_next()
        
        return skipped

    async def track_end(self, player: wavelink.Player, track: wavelink.Playable, reason: str):
        """트랙 종료 이벤트 핸들러"""
        if reason == "FINISHED":
            await self.play_next()
