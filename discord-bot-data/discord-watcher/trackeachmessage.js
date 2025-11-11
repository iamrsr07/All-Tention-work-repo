import { Client, GatewayIntentBits, Partials } from "discord.js";
import dotenv from "dotenv";
dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

// === CONFIG ===
const SUPERVISORS = [
  {
    id: "1235236826793381908",
    channels: ["1427650466598354954", "1427651512477155398", "1431648677386260580"],
  },
  {
    id: "1427987539691835442",
    channels: ["1427650949954142239", "1427651063393030214"],
  },
];

const MANAGER_ID = "1235236826793381908";


const ONE_MINUTE = 1 * 60 * 1000; // 1 minute
const THIRTY_SECONDS = 30 * 1000; // 30 minutes

// === TRACKERS ===
// Map<supervisorId, Map<messageId, {userId, channelId, timers}>>
const supervisorTrackers = new Map();

// === HELPERS ===
function getSupervisorByChannel(channelId) {
  return SUPERVISORS.find((sup) => sup.channels.includes(channelId));
}

function ensureSupervisorMap(supervisorId) {
  if (!supervisorTrackers.has(supervisorId)) {
    supervisorTrackers.set(supervisorId, new Map());
  }
  return supervisorTrackers.get(supervisorId);
}

// === WATCH USER MESSAGES ===
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const supervisor = getSupervisorByChannel(message.channel.id);
  if (!supervisor) return;

  const supervisorId = supervisor.id;
  const supervisorMessages = ensureSupervisorMap(supervisorId);

  // --- Each incoming user message triggers independent tracking ---
  const msgLink = `https://discord.com/channels/${message.guildId}/${message.channel.id}/${message.id}`;
  const msgId = message.id;
  const userId = message.author.id;

  console.log(`Tracking message ${msgId} for supervisor ${supervisorId}`);

  const timers = {};

  // === 2-hour timer ===
  timers.supervisorTimer = setTimeout(async () => {
    try {
      const supUser = await client.users.fetch(supervisorId);
      await supUser.send(
        `⏰ Hey <@${supervisorId}>, you haven’t replied to <@${userId}>'s message yet!\nLink: ${msgLink}`
      );

      // === 30-min reminder + escalate ===
      timers.reminderTimer = setTimeout(async () => {
        try {
          await supUser.send(
            `⚠️ Reminder: Still no reply to <@${userId}>'s message.\nLink: ${msgLink}`
          );
          const manager = await client.users.fetch(MANAGER_ID);
          await manager.send(
            `🚨 Supervisor <@${supervisorId}> still hasn’t replied to <@${userId}>'s message.\nLink: ${msgLink}`
          );
        } catch (err) {
          console.error("Error during reminder/manager DM:", err);
        }
      }, THIRTY_SECONDS);
    } catch (err) {
      console.error("Error sending supervisor DM:", err);
    }
  }, ONE_MINUTE);

  supervisorMessages.set(msgId, {
    userId,
    channelId: message.channel.id,
    messageLink: msgLink,
    timers,
  });
});

// === WATCH SUPERVISOR REPLIES ===
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const supervisor = SUPERVISORS.find((sup) => sup.id === message.author.id);
  if (!supervisor) return; // not a supervisor

  const supervisorId = supervisor.id;
  const supervisorMessages = supervisorTrackers.get(supervisorId);
  if (!supervisorMessages) return;

  // Cancel timers for messages in this channel only
  for (const [msgId, tracked] of supervisorMessages.entries()) {
    if (tracked.channelId === message.channel.id) {
      clearTimeout(tracked.timers.supervisorTimer);
      clearTimeout(tracked.timers.reminderTimer);
      supervisorMessages.delete(msgId);
      console.log(
        `✅ Supervisor ${supervisorId} replied in channel ${message.channel.id} → cleared timers for ${msgId}`
      );
    }
  }

  // Clean up map if empty
  if (supervisorMessages.size === 0) {
    supervisorTrackers.delete(supervisorId);
  }
});

// === SHUTDOWN ===
process.on("SIGINT", () => {
  console.log("🛑 Shutting down...");
  for (const [, msgs] of supervisorTrackers) {
    for (const [, tracked] of msgs) {
      clearTimeout(tracked.timers.supervisorTimer);
      clearTimeout(tracked.timers.reminderTimer);
    }
  }
  process.exit();
});

client.login(process.env.DISCORD_TOKEN);
