import 'dotenv/config';
import { Client, GatewayIntentBits } from "discord.js";
import axios from "axios";

// ------------------- SETTINGS -------------------

// 👇 Replace with your actual Discord channel ID
const WATCH_CHANNEL_ID = "1435280521134477322";

// 👇 Your n8n webhook URL
//const WEBHOOK_URL = "https://tention.app.n8n.cloud/webhook/client-alert";
const WEBHOOK_URL = "https://tention.app.n8n.cloud/webhook-test/client-alert";

// 👇 Bot token (you can either load from .env or paste directly)
const DISCORD_TOKEN = process.env.DISCORD_TOKEN || "PASTE_YOUR_BOT_TOKEN_HERE";

// ------------------------------------------------

// Create Discord client
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
});

client.on("messageCreate", async (message) => {
  try {
    // Ignore bot messages
    if (message.author.bot) return;

    // Only process messages from the watched channel
    if (message.channel.id !== WATCH_CHANNEL_ID) return;

    console.log(`💬 Message from ${message.author.username}: ${message.content}`);

    // Check for "New Client Alert!" keyword
    if (message.content.includes("New Client Alert!")) {
      console.log("🚀 Sending message to n8n webhook...");

      // Payload to send to n8n
      const payload = {
        content: message.content,
        channelId: message.channel.id,
        channelName: message.channel.name,
        author: message.author.username,
        createdAt: message.createdAt,
        messageUrl: `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`,
      };

      // Send data to n8n webhook
      await axios.post(WEBHOOK_URL, payload);
      console.log("✅ Successfully sent to n8n!");
    }
  } catch (error) {
    console.error("❌ Error sending to n8n:", error.message);
  }
});

// Log in to Discord
if (!DISCORD_TOKEN || DISCORD_TOKEN === "PASTE_YOUR_BOT_TOKEN_HERE") {
  console.error("❌ Missing Discord Bot Token! Please set DISCORD_TOKEN in .env or directly in code.");
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
