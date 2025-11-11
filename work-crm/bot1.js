import 'dotenv/config';
import { Client, GatewayIntentBits } from "discord.js";
import axios from "axios";

// Create Discord client with message reading permissions
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ✅ Replace this with your actual channel ID
const WATCH_CHANNEL_ID = "1427543130856751136"; // <--- your channel ID here

// n8n webhook URL
const WEBHOOK_URL = "https://tention.app.n8n.cloud/webhook-test/client-alert";

client.on("ready", () => {
  console.log(`🤖 Bot logged in as ${client.user.tag}`);
  console.log(`👀 Watching channel ID: ${WATCH_CHANNEL_ID}`);
});

client.on("messageCreate", async (message) => {
  try {
    // Ignore bot messages
    if (message.author.bot) return;

    // ✅ Only watch messages in one specific channel
    if (message.channel.id !== WATCH_CHANNEL_ID) return;

    // Log every message in that channel
    console.log(`💬 Message detected in watched channel by ${message.author.username}`);
    console.log("📝 Message Content:\n", message.content);

    // ✅ Only send to n8n if it's a "New Client Alert!"
    if (message.content.includes("New Client Alert!")) {
      console.log("🚀 Sending message to n8n webhook...");

      const payload = {
        content: message.content,
        channelId: message.channel.id,
        channelName: message.channel.name,
        author: message.author.username,
        createdAt: message.createdAt,
        messageUrl: `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`,
      };

      await axios.post(WEBHOOK_URL, payload);

      console.log("✅ Successfully sent to n8n!");
    }
  } catch (error) {
    console.error("❌ Error sending to n8n:", error.message);
  }
});

client.login(process.env.DISCORD_TOKEN);
