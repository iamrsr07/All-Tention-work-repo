import "dotenv/config";
import { Client, GatewayIntentBits } from "discord.js";
import axios from "axios";

const WATCH_CHANNEL_ID = "1432708334665994280";
const WEBHOOK_URL = process.env.N8N_WEBHOOK_URL?.trim();
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

if (!DISCORD_TOKEN) {
  console.error("❌ Missing Discord Bot Token!");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("ready", () => {
  console.log(`🤖 Bot logged in as ${client.user.tag}`);
  console.log(`👀 Watching channel ID: ${WATCH_CHANNEL_ID}`);

  client.user.setPresence({
    status: "online",
    activities: [{ name: "Watching client alerts" }],
  });
});

client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) return;
    if (message.channel.id !== WATCH_CHANNEL_ID) return;
    if (!message.content.startsWith("New Client Alert!")) return;

    const payload = {
      content: message.content,
      channelId: message.channel.id,
      channelName: message.channel.name,
      author: message.author.username,
      createdAt: message.createdAt.toISOString(),
      messageUrl: `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`,
    };

    await axios.post(WEBHOOK_URL, payload);
    console.log("✅ Sent to n8n");
  } catch (error) {
    console.error("❌ Webhook error:", {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });
  }
});

client.login(DISCORD_TOKEN);
