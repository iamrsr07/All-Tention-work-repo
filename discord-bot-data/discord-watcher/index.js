import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: ["CHANNEL"], // needed to DM users
});

// Load config
const WATCHED_CHANNELS = process.env.CHANNEL_IDS.split(",");
const WATCHED_USERS = process.env.WATCH_USER_IDS.split(",");
const WAIT_HOURS = parseFloat(process.env.WAIT_HOURS) || 2;

const userTimers = new Map();

client.on("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  // Ignore bot messages
  if (message.author.bot) return;

  // Only track specific channels
  if (!WATCHED_CHANNELS.includes(message.channel.id)) return;

  // Only track specific users
  const userId = message.author.id;
  if (!WATCHED_USERS.includes(userId)) return;

  // If user already has a timer, reset it
  if (userTimers.has(userId)) {
    clearTimeout(userTimers.get(userId));
    userTimers.delete(userId);
    console.log(`🔁 Timer reset for ${userId} (sent new message)`);
  }

  // Start new 2-hour timer
const delayMs = 1 * 60 * 1000; // 1 minute
  const timer = setTimeout(async () => {
    try {
      const user = await client.users.fetch(userId);
      await user.send(
        `👋 Hey <@${userId}>, you haven’t messaged in ${WAIT_HOURS} hours!`
      );
      console.log(`📩 DM sent to ${user.username} (${userId})`);
    } catch (err) {
      console.error(`❌ Could not DM ${userId}:`, err.message);
    }
    userTimers.delete(userId);
  }, delayMs);

  // Save timer reference
  userTimers.set(userId, timer);
  console.log(`⏱️ Started ${WAIT_HOURS}h timer for ${userId}`);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("🛑 Shutting down...");
  for (const [, timer] of userTimers) clearTimeout(timer);
  process.exit();
});

client.login(process.env.DISCORD_TOKEN);
