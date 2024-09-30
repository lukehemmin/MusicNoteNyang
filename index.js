require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const { Manager } = require('erela.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

client.manager = new Manager({
  nodes: [
    {
      host: process.env.LAVALINK_HOST,
      port: parseInt(process.env.LAVALINK_PORT),
      password: process.env.LAVALINK_PASSWORD,
      secure: false, // SSL/TLS를 사용하는 경우 true로 설정
    },
  ],
  send: (id, payload) => {
    const guild = client.guilds.cache.get(id);
    if (guild) guild.shard.send(payload);
  },
  autoPlay: true,
  clientName: "MusicNoteNyang",
})
  .on("nodeConnect", node => console.log(`Node "${node.options.identifier}" connected.`))
  .on("nodeError", (node, error) => {
    console.error(`Node "${node.options.identifier}" encountered an error:`, error);
  })
  .on("trackStart", (player, track) => {
    const channel = client.channels.cache.get(player.textChannel);
    channel.send(`Now playing: ${track.title}`);
  })
  .on("queueEnd", (player) => {
    const channel = client.channels.cache.get(player.textChannel);
    channel.send("Queue ended.");
    player.destroy();
  });

const commands = [
  {
    name: 'play',
    description: 'Play a song',
    options: [
      {
        name: 'query',
        type: 3, // STRING type
        description: 'The song you want to play',
        required: true,
      },
    ],
  },
];

async function registerCommands() {
  try {
    console.log('Started refreshing application (/) commands.');
    
    const rest = new REST({ version: '9' }).setToken(process.env.BOT_TOKEN);
    
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands },
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error('Error refreshing commands:', error);
  }
}

client.once('ready', async () => {
  console.log('Bot is ready!');
  client.manager.init(client.user.id);
  
  await registerCommands();
});

client.on("raw", d => client.manager.updateVoiceState(d));

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  const { commandName } = interaction;

  if (commandName === 'play') {
    if (!interaction.member.voice.channel) {
      return interaction.reply('You need to be in a voice channel to use this command!');
    }

    const query = interaction.options.getString('query');
    const res = await client.manager.search(query, interaction.user);

    if (res.loadType === "LOAD_FAILED") {
      return interaction.reply("There was an error while searching.");
    } else if (res.loadType === "NO_MATCHES") {
      return interaction.reply("There were no results found.");
    }

    const player = client.manager.create({
      guild: interaction.guild.id,
      voiceChannel: interaction.member.voice.channel.id,
      textChannel: interaction.channel.id,
    });

    player.connect();

    if (res.loadType === "PLAYLIST_LOADED") {
      player.queue.add(res.tracks);
      interaction.reply(`Enqueued playlist ${res.playlist.name} with ${res.tracks.length} tracks.`);
    } else {
      player.queue.add(res.tracks[0]);
      interaction.reply(`Enqueued ${res.tracks[0].title}`);
    }

    if (!player.playing && !player.paused && !player.queue.size) player.play();
  }
});

client.login(process.env.BOT_TOKEN);