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
    id: "SUPERVISOR_USER_ID_1",
    channels: ["CHANNEL_ID_1", "CHANNEL_ID_2", "CHANNEL_ID_3"],
  },
  {
    id: "SUPERVISOR_USER_ID_2",
    channels: ["CHANNEL_ID_4", "CHANNEL_ID_5"],
  },
];

// 🧑‍💼 MULTIPLE MANAGERS
// ✅ You can add as many as you want here
const MANAGERS = ["MANAGER_ID_1", "MANAGER_ID_2", "MANAGER_ID_3"];

// === TIMER SETTINGS ===
const ONE_MINUTE = 1 * 60 * 1000; // 1 minute
const THIRTY_SECONDS = 30 * 1000; // 30 seconds
const TEN_SECONDS = 10 * 1000; // 10 seconds

// === TRACKERS ===
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

// ✅ WORKING HOURS CHECK (9 AM – 5 PM EST)
function isWithinWorkingHours() {
  const now = new Date();
  const estNow = new Date(
    now.toLocaleString("en-US", { timeZone: "America/New_York" })
  );
  const hours = estNow.getHours();
  return hours >= 9 && hours < 17;
}

// === EVENT: CLIENT MESSAGE ===
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // Check if the message came from a supervised channel
  const supervisor = getSupervisorByChannel(message.channel.id);
  if (!supervisor) return;

  const supervisorId = supervisor.id;
  const supervisorMessages = ensureSupervisorMap(supervisorId);

  const msgId = message.id;
  const userId = message.author.id;
  const msgLink = `https://discord.com/channels/${message.guildId}/${message.channel.id}/${message.id}`;

  console.log(`📩 Tracking message ${msgId} for supervisor ${supervisorId}`);

  const timers = {};

  // Step 1️⃣: After 1 minute → DM supervisor
  timers.supervisorTimer = setTimeout(async () => {
    if (!isWithinWorkingHours()) {
      console.log("⏸ Outside working hours — skipping supervisor DM");
      return;
    }

    try {
      const supUser = await client.users.fetch(supervisorId);
      await supUser.send(
        `⏰ Hey <@${supervisorId}>, you haven’t replied to <@${userId}>'s message yet!\nLink: ${msgLink}`
      );

      // Step 2️⃣: After 30 seconds → reminder DM
      timers.reminderTimer = setTimeout(async () => {
        if (!isWithinWorkingHours()) {
          console.log("⏸ Outside working hours — skipping reminder");
          return;
        }

        try {
          await supUser.send(
            `⚠️ Reminder: You still haven’t replied to <@${userId}>'s message.\nLink: ${msgLink}`
          );

          // Step 3️⃣: After 10 seconds → escalate to all managers
          timers.managerTimer = setTimeout(async () => {
            if (!isWithinWorkingHours()) {
              console.log("⏸ Outside working hours — skipping manager alert");
              return;
            }

            try {
              // Send escalation to ALL managers
              for (const managerId of MANAGERS) {
                const manager = await client.users.fetch(managerId);
                await manager.send(
                  `🚨 Supervisor <@${supervisorId}> has not replied to <@${userId}>'s message.\nLink: ${msgLink}`
                );
              }
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

  supervisorMessages.set(msgId, {
    userId,
    channelId: message.channel.id,
    messageLink: msgLink,
    timers,
  });
});

// === EVENT: SUPERVISOR or MANAGER REPLY ===
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const isSupervisor = SUPERVISORS.some((sup) => sup.id === message.author.id);
  const isManager = MANAGERS.includes(message.author.id);

  if (!isSupervisor && !isManager) return;

  // find which supervisor manages this channel
  const supervisor = getSupervisorByChannel(message.channel.id);
  if (!supervisor) return;

  const supervisorId = supervisor.id;
  const supervisorMessages = supervisorTrackers.get(supervisorId);
  if (!supervisorMessages) return;

  for (const [msgId, tracked] of supervisorMessages.entries()) {
    if (tracked.channelId === message.channel.id) {
      clearTimeout(tracked.timers.supervisorTimer);
      clearTimeout(tracked.timers.reminderTimer);
      clearTimeout(tracked.timers.managerTimer);
      supervisorMessages.delete(msgId);
      console.log(
        `✅ ${isManager ? "Manager" : "Supervisor"} ${
          message.author.id
        } replied → cleared timers for ${msgId}`
      );
    }
  }

  if (supervisorMessages.size === 0) {
    supervisorTrackers.delete(supervisorId);
  }
});

// === SAFE SHUTDOWN ===
process.on("SIGINT", () => {
  console.log("🛑 Shutting down...");
  for (const [, msgs] of supervisorTrackers) {
    for (const [, tracked] of msgs) {
      clearTimeout(tracked.timers.supervisorTimer);
      clearTimeout(tracked.timers.reminderTimer);
      clearTimeout(tracked.timers.managerTimer);
    }
  }
  process.exit();
});

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);
