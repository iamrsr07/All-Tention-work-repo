import 'dotenv/config';
import { Client, GatewayIntentBits } from "discord.js";
import axios from "axios";

// ------------------- SETTINGS -------------------
const WATCH_CHANNEL_ID = "1432708334665994280";
 const WEBHOOK_URL = "https://tention.app.n8n.cloud/webhook-test/client-alert";
//const WEBHOOK_URL =      " https://tention.app.n8n.cloud/webhook/client-alert"
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;   // Use .env properly
// ------------------------------------------------

// Validate token
if (!DISCORD_TOKEN) {
  console.error("❌ Missing Discord Bot Token! Add DISCORD_TOKEN in .env");
  process.exit(1);
}

// Create bot client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// FIX: correct event name for discord.js v15
client.once("clientReady", () => {
  console.log(`🤖 Bot logged in as ${client.user.tag}`);
  console.log(`👀 Watching channel ID: ${WATCH_CHANNEL_ID}`);

  // Optional: force bot to appear online
  client.user.setPresence({
    status: "online",
    activities: [{ name: "Watching client alerts" }]
  });
});

// Handle messages
client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) return;
    if (message.channel.id !== WATCH_CHANNEL_ID) return;

    console.log(`💬 Message from ${message.author.username}: ${message.content}`);

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

// Login with the correct token
client.login(DISCORD_TOKEN);
