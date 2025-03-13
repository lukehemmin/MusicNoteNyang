import { Client, Events, GatewayIntentBits, Collection } from 'discord.js';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';

// .env 파일에서 환경 변수 로드
config();

// Discord 클라이언트 생성 및 인텐트 설정
const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ] 
});

// 명령어 컬렉션 생성
interface ClientWithCommands extends Client {
  commands?: Collection<string, any>;
}

const clientWithCommands = client as ClientWithCommands;
clientWithCommands.commands = new Collection();

// 명령어 파일 로드
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  
  if ('data' in command && 'execute' in command) {
    clientWithCommands.commands.set(command.data.name, command);
  } else {
    console.log(`[경고] ${filePath}에 data나 execute 속성이 없습니다`);
  }
}

// 클라이언트가 준비되면 실행될 이벤트
client.once(Events.ClientReady, (c) => {
  console.log(`준비 완료! ${c.user.tag}으로 로그인됨`);
});

// 인터랙션 처리 이벤트
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  
  const command = clientWithCommands.commands?.get(interaction.commandName);
  
  if (!command) {
    console.error(`${interaction.commandName} 명령어를 찾을 수 없습니다.`);
    return;
  }
  
  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: '명령어 실행 중 오류가 발생했습니다!', ephemeral: true });
    } else {
      await interaction.reply({ content: '명령어 실행 중 오류가 발생했습니다!', ephemeral: true });
    }
  }
});

// Discord 토큰으로 봇 로그인
client.login(process.env.DISCORD_TOKEN)
  .catch((error) => {
    console.error('봇 로그인 실패:', error);
    process.exit(1);
  });

// 에러 핸들링
process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
}); 