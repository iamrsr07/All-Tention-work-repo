require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

// To remember who already got a reply
const usersWhoGotReply = new Set();

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on("messageCreate", (message) => {
  if (message.author.bot) return;

  // If it's their first message
  if (!usersWhoGotReply.has(message.author.id)) {
    usersWhoGotReply.add(message.author.id);
    message.reply(`Hey ${message.author.username}! 👋 Nice to see your first message here!`);
  }
});

client.login(process.env.DISCORD_TOKEN);
