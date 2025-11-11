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

// === CONFIGURATION ===
const SUPERVISORS = [
  {
    id: "1235236826793381908",
    channels: [
      "1427650466598354954",
      "1427651512477155398",
      "1431648677386260580",
    ],
  },
  {
    id: "1427987539691835442",
    channels: ["1427650949954142239", "1427651063393030214"],
  },
];

const MANAGER_ID = "1235236826793381908"; // your manager

// === TIMER SETTINGS ===
const ONE_MINUTE = 1 * 60 * 1000; // 1 minute
const THIRTY_SECONDS = 30 * 1000; // 30 seconds
const TEN_SECONDS = 10 * 1000; // 10 seconds

// === TRACKERS ===
const messageTrackers = new Map(); // Key: message.id

function getSupervisorByChannel(channelId) {
  return SUPERVISORS.find((sup) => sup.channels.includes(channelId));
}

// === EVENT: CLIENT MESSAGE (Start tracking) ===
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const supervisor = getSupervisorByChannel(message.channel.id);
  if (!supervisor) return;

  const supervisorId = supervisor.id;
  const msgId = message.id;

  const tracker = {
    supervisorId,
    userId: message.author.id,
    messageLink: `https://discord.com/channels/${message.guildId}/${message.channel.id}/${msgId}`,
    supervisorTimer: null,
    reminderTimer: null,
    managerTimer: null,
    replied: false,
  };

  messageTrackers.set(msgId, tracker);

  console.log(`📩 Tracking message ${msgId} for supervisor ${supervisorId}`);

  // Step 1️⃣ → DM Supervisor after 1 minute
  tracker.supervisorTimer = setTimeout(async () => {
    try {
      const supUser = await client.users.fetch(supervisorId);
      await supUser.send(
        `⏰ Hey <@${supervisorId}>, you haven’t replied to <@${tracker.userId}>'s message yet!\nLink: ${tracker.messageLink}`
      );

      // Step 2️⃣ → Reminder after 30s
      tracker.reminderTimer = setTimeout(async () => {
        try {
          await supUser.send(
            `⚠️ Reminder: You still haven’t replied to <@${tracker.userId}>'s message.\nLink: ${tracker.messageLink}`
          );

          // Step 3️⃣ → Escalate to manager after 10s
          tracker.managerTimer = setTimeout(async () => {
            try {
              const manager = await client.users.fetch(MANAGER_ID);
              await manager.send(
                `🚨 Supervisor <@${supervisorId}> has not replied to <@${tracker.userId}>'s message.\nLink: ${tracker.messageLink}`
              );
            } catch (err) {
              console.error("❌ Error sending manager DM:", err);
            }
          }, TEN_SECONDS);
        } catch (err) {
          console.error("❌ Error sending reminder:", err);
        }
      }, THIRTY_SECONDS);
    } catch (err) {
      console.error("❌ Error sending supervisor DM:", err);
    }
  }, ONE_MINUTE);
});

// === EVENT: SUPERVISOR or MANAGER REPLY (Stop timers) ===
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const isSupervisor = SUPERVISORS.some((sup) => sup.id === message.author.id);
  const isManager = message.author.id === MANAGER_ID;
  if (!isSupervisor && !isManager) return;

  // Find which supervisor owns this channel
  const supervisor = getSupervisorByChannel(message.channel.id);
  if (!supervisor) return;

  for (const [msgId, tracker] of messageTrackers.entries()) {
    if (tracker.supervisorId !== supervisor.id) continue;
    if (tracker.replied) continue;

    clearTimeout(tracker.supervisorTimer);
    clearTimeout(tracker.reminderTimer);
    clearTimeout(tracker.managerTimer);

    tracker.replied = true;
    messageTrackers.delete(msgId);

    console.log(
      `✅ ${isManager ? "Manager" : "Supervisor"} ${
        message.author.id
      } replied in channel ${message.channel.id}. Timers cleared for ${msgId}.`
    );
  }
});

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);
