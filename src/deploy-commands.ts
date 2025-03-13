import { REST, Routes } from 'discord.js';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';

// .env 파일 로드
config();

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// 모든 명령어 파일을 불러옵니다
for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  
  if ('data' in command && 'execute' in command) {
    commands.push(command.data.toJSON());
    console.log(`명령어 ${command.data.name} 추가됨`);
  } else {
    console.log(`[경고] ${filePath}에 data나 execute 속성이 없습니다`);
  }
}

// Discord API에 명령어 등록
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN as string);

(async () => {
  try {
    console.log(`${commands.length}개의 슬래시 명령어 등록 중...`);
    console.log('기존에 등록된 모든 명령어는 삭제되고 새로운 명령어로 대체됩니다.');

    const clientId = process.env.CLIENT_ID;

    if (!clientId) {
      throw new Error('CLIENT_ID가 .env 파일에 없습니다');
    }

    const guildId = process.env.GUILD_ID;
    
    let data: any[] = [];
    
    // GUILD_ID가 있으면 특정 서버에만 명령어 등록, 없으면 글로벌 명령어로 등록
    // Discord API의 PUT 요청은 기존 명령어를 모두 삭제하고 새 명령어로 덮어씁니다.
    if (guildId) {
      console.log(`서버(길드) ID가 있습니다. 서버 ${guildId}에 명령어를 등록합니다...`);
      data = await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commands },
      ) as any[];
    } else {
      console.log('서버(길드) ID가 없습니다. 글로벌 명령어로 등록합니다...');
      console.log('글로벌 명령어는 적용되는 데 최대 1시간이 걸릴 수 있습니다.');
      data = await rest.put(
        Routes.applicationCommands(clientId),
        { body: commands },
      ) as any[];
    }
    
    console.log(`이전 명령어가 모두 삭제되고, ${data.length}개의 슬래시 명령어가 성공적으로 등록되었습니다`);
  } catch (error) {
    console.error('명령어 등록 중 오류 발생:', error);
  }
})(); 