import { Client, GatewayIntentBits, Partials } from "discord.js";
import dotenv from "dotenv";
dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction],
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

const MANAGER_ID = "960685716852072458";
const SENIOR_MANAGER_ID = "1235236826793381908"; // ⭐ NEW

// === TIMER SETTINGS ===
const ONE_MINUTE = 1 * 60 * 1000;
const THIRTY_SECONDS = 30 * 1000;
const TEN_SECONDS = 10 * 1000;
const TWO_MINUTES = 2 * 60 * 1000; // ⭐ NEW

// === TRACKERS ===
const supervisorTrackers = new Map();
const seniorTimers = new Map(); // ⭐ NEW

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

// ⭐ NEW — 2-Minute Senior Manager Timer
function startSeniorTimer(supervisorId, userId, msgLink, serverName) {
  const t = setTimeout(async () => {
    try {
      const senior = await client.users.fetch(SENIOR_MANAGER_ID);

      await senior.send(
        `⚠️ **Supervisor <@${supervisorId}> or Manager <@${MANAGER_ID}> has NOT replied**\n` +
        `Client: <@${userId}>\n` +
        `Link: ${msgLink}\n` +
        `${serverName}`
      );

      console.log("🚨 Sent 2-minute alert to senior manager");
    } catch (err) {
      console.error("❌ Error sending senior manager DM:", err);
    }
  }, TWO_MINUTES);

  seniorTimers.set(msgLink, t);
}

// === EVENT: USER MESSAGE → START TIMER ===
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const supervisor = getSupervisorByChannel(message.channel.id);
  if (!supervisor) return;

  if (message.author.id === supervisor.id || message.author.id === MANAGER_ID) return;

  const supervisorId = supervisor.id;
  const supervisorMessages = ensureSupervisorMap(supervisorId);

  const msgId = message.id;
  const userId = message.author.id;
  const msgLink = `https://discord.com/channels/${message.guildId}/${message.channel.id}/${message.id}`;

  console.log(`📩 Tracking message ${msgId} for supervisor ${supervisorId}`);

  // ⭐ NEW — START SENIOR TIMER
  startSeniorTimer(supervisorId, userId, msgLink, message.guild.name);

  const timers = {};

  timers.supervisorTimer = setTimeout(async () => {
    try {
      const supUser = await client.users.fetch(supervisorId);
      await supUser.send(
        `⏰ Hey <@${supervisorId}>, you haven’t replied to <@${userId}>'s message yet!\nLink: ${msgLink}`
      );

      timers.reminderTimer = setTimeout(async () => {
        try {
          await supUser.send(
            `⚠️ Reminder: You still haven’t replied to <@${userId}>'s message.\nLink: ${msgLink}`
          );

          timers.managerTimer = setTimeout(async () => {
            try {
              const manager = await client.users.fetch(MANAGER_ID);
              await manager.send(
                `🚨 Supervisor <@${supervisorId}> has not replied to <@${userId}>'s message.\nLink: ${msgLink}`
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

  supervisorMessages.set(msgId, {
    userId,
    channelId: message.channel.id,
    messageLink: msgLink,
    timers,
  });
});

// === EVENT: SUPERVISOR OR MANAGER REPLY ===
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const supervisor = getSupervisorByChannel(message.channel.id);
  if (!supervisor) return;

  const isSupervisor = message.author.id === supervisor.id;
  const isManager = message.author.id === MANAGER_ID;

  if (!isSupervisor && !isManager) return;

  const supervisorMessages = supervisorTrackers.get(supervisor.id);
  if (!supervisorMessages) return;

  for (const [msgId, tracked] of supervisorMessages.entries()) {
    if (tracked.channelId === message.channel.id) {

      // ⭐ NEW — CANCEL 2-MIN TIMER
      const st = seniorTimers.get(tracked.messageLink);
      if (st) {
        clearTimeout(st);
        seniorTimers.delete(tracked.messageLink);
      }

      clearTimeout(tracked.timers.supervisorTimer);
      clearTimeout(tracked.timers.reminderTimer);
      clearTimeout(tracked.timers.managerTimer);
      supervisorMessages.delete(msgId);

      console.log(
        `✅ ${isManager ? "Manager" : "Supervisor"} ${message.author.id} replied → cleared timers for ${msgId}`
      );
    }
  }

  if (supervisorMessages.size === 0) {
    supervisorTrackers.delete(supervisor.id);
  }
});

// === EVENT: SUPERVISOR OR MANAGER REACTION ===
client.on("messageReactionAdd", async (reaction, user) => {
  if (user.bot) return;

  const message = reaction.message;
  const supervisor = getSupervisorByChannel(message.channel.id);
  if (!supervisor) return;

  const isSupervisor = user.id === supervisor.id;
  const isManager = user.id === MANAGER_ID;

  if (!isSupervisor && !isManager) return;

  const supervisorMessages = supervisorTrackers.get(supervisor.id);
  if (!supervisorMessages) return;

  for (const [msgId, tracked] of supervisorMessages.entries()) {
    if (tracked.channelId === message.channel.id) {

      // ⭐ NEW — CANCEL 2-MIN TIMER
      const st = seniorTimers.get(tracked.messageLink);
      if (st) {
        clearTimeout(st);
        seniorTimers.delete(tracked.messageLink);
      }

      clearTimeout(tracked.timers.supervisorTimer);
      clearTimeout(tracked.timers.reminderTimer);
      clearTimeout(tracked.timers.managerTimer);
      supervisorMessages.delete(msgId);

      console.log(`🟢 ${isManager ? "Manager" : "Supervisor"} ${user.id} reacted → cleared timers for ${msgId}`);
    }
  }

  if (supervisorMessages.size === 0) {
    supervisorTrackers.delete(supervisor.id);
  }
});

// === SHUTDOWN CLEANUP ===
process.on("SIGINT", () => {
  console.log("🛑 Shutting down...");
  for (const [, msgs] of supervisorTrackers) {
    for (const [, tracked] of msgs) {
      clearTimeout(tracked.timers.supervisorTimer);
      clearTimeout(tracked.timers.reminderTimer);
      clearTimeout(tracked.timers.managerTimer);
    }
  }

  // ⭐ NEW CLEANUP
  for (const [, t] of seniorTimers) clearTimeout(t);

  process.exit();
});

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);
