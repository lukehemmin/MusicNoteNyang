# MusicNoteNyang Discord Bot

TypeScript와 Discord.js를 사용하여 만든 Discord 봇입니다.

## 설치 방법

1. 저장소를 클론합니다:
```bash
git clone https://github.com/yourusername/MusicNoteNyang.git
cd MusicNoteNyang
```

2. 필요한 패키지를 설치합니다:
```bash
npm install
```

3. `.env` 파일을 수정하여 Discord 봇 토큰과 정보를 설정합니다:
```
DISCORD_TOKEN=your_discord_bot_token_here
CLIENT_ID=your_client_id_here
GUILD_ID=your_guild_id_here  # 선택사항: 특정 서버에만 명령어를 등록하려면 입력하세요
```

> 참고: GUILD_ID를 입력하지 않으면 명령어가 글로벌로 등록되어 모든 서버에서 사용할 수 있지만, 등록/업데이트에 최대 1시간이 걸릴 수 있습니다. 개발 중이라면 GUILD_ID를 입력하여 즉시 명령어를 테스트하는 것이 좋습니다.

## 봇 실행 방법

1. TypeScript 파일을 컴파일합니다:
```bash
npm run build
```

2. 슬래시 명령어를 등록합니다:
```bash
node dist/deploy-commands.js
```

> 중요: `deploy-commands.js`를 실행하면 이전에 등록된 모든 명령어가 삭제되고, 현재 `commands` 폴더에 정의된 명령어만 새롭게 등록됩니다. 명령어를 추가하거나 수정할 때마다 이 스크립트를 다시 실행해야 합니다.

3. 봇을 실행합니다:
```bash
npm start
```

개발 모드로 실행하려면:
```bash
npm run dev
```

## 봇 명령어

- `/ping` - 봇의 응답 시간을 확인합니다.

## 기여 방법

1. 이 프로젝트를 포크합니다.
2. 새 기능 브랜치를 만듭니다 (`git checkout -b feature/amazing-feature`)
3. 변경사항을 커밋합니다 (`git commit -m 'Add some amazing feature'`)
4. 브랜치에 푸시합니다 (`git push origin feature/amazing-feature`)
5. Pull Request를 보냅니다.

## 라이센스

MIT 라이센스를 따릅니다. 