const { Client, GatewayIntentBits } = require("discord.js");
const http = require("http");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessages
  ]
});

// Render web server
const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Bot is online!");
}).listen(PORT, () => {
  console.log(`Web server running on port ${PORT}`);
});

// Bot ready
client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// Prefix-style commands using bot mention
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const mention = `<@${client.user.id}>`;
  const mentionNick = `<@!${client.user.id}>`;

  if (!message.content.startsWith(mention) && !message.content.startsWith(mentionNick)) {
    return;
  }

  const commandText = message.content
    .replace(mention, "")
    .replace(mentionNick, "")
    .trim();

  const args = commandText.split(/\s+/);
  const command = args.shift()?.toLowerCase();

  if (command === "ping") {
    await message.reply(`🏓 Pong! **${client.ws.ping}ms**`);
  }
});

client.login(process.env.DISCORD_TOKEN);
