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

// =====================================================
// CONFIG: SUPERVISORS + THEIR OWN MANAGERS
// =====================================================

const SUPERVISORS = [
{
id: "1427987539691835442", //Prajit
channels: [
"1427650466598354954", //prepa-pizza
"1427651512477155398", //holistic-honey


],
managers: ["1427987539691835442"]



},{
id: "1427987539691835442", //Prajit
channels: [
"1427650949954142239", //prepa-pizza
"1427651063393030214", //holistic-honey


],
managers: ["960685716852072458"]



},




];

const SENIOR_MANAGER_ID = "1235236826793381908";

// =====================================================
// GLOBAL MANAGER PROTECTION — FIX IMPORTANT
// =====================================================
const ALL_MANAGERS = new Set(SUPERVISORS.flatMap(s => s.managers));

// =====================================================
// TIMER SETTINGS
// =====================================================
const FIRST_REMINDER = 30 * 1000;

// Second reminder: 20 seconds
const SECOND_REMINDER = 20 * 1000;

// Third reminder: 10 seconds
const THIRD_REMINDER = 10 * 1000;

// Fourth reminder: 1 minute
const FOURTH_REMINDER = 60 * 1000;

// =====================================================
// TRACKING MAPS
// =====================================================
const supervisorTrackers = new Map();
const seniorTimers = new Map();

// =====================================================
// HELPERS
// =====================================================
function getSupervisorByChannel(channelId) {
  return SUPERVISORS.find((s) => s.channels.includes(channelId));
}

function ensureSupervisorMap(supervisorId) {
  if (!supervisorTrackers.has(supervisorId)) {
    supervisorTrackers.set(supervisorId, new Map());
  }
  return supervisorTrackers.get(supervisorId);
}

function startSeniorTimer(supervisorId, userId, msgLink, serverName, channelId, supervisor) {
  const timer = setTimeout(async () => {
    try {
      const senior = await client.users.fetch(SENIOR_MANAGER_ID);

      // Fetch supervisor username
      const supervisorUser = await client.users.fetch(supervisorId);

      // Fetch each manager username
      const managerList = await Promise.all(
        supervisor.managers.map(async (mgrId) => {
          const usr = await client.users.fetch(mgrId);
          return `<@${mgrId}>`;
        })
      );

await senior.send(
  `⚠️Clients <@${supervisorId}> OR Manager ${managerList.join(", ")} has NOT replied\n` +
  `Client: <@${userId}>\n` +
  `Channel: <#${channelId}>\n` +
  `Link: ${msgLink}`
);



    } catch (err) {
      console.error("❌ Error sending senior manager DM:", err);
    }
  }, FOURTH_REMINDER);

  seniorTimers.set(msgLink, timer);
}




// =========================================================
// EVENT — CLIENT MESSAGE → START TIMERS
// FIX: ANY MANAGER MESSAGE NEVER STARTS TIMER
// =========================================================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // NEW FIX — Manager messages MUST NOT start timers anywhere
  if (ALL_MANAGERS.has(message.author.id)) return;

  const supervisor = getSupervisorByChannel(message.channel.id);
  if (!supervisor) return;

  if (message.author.id === supervisor.id) return;
  if (supervisor.managers.includes(message.author.id)) return;

  const supervisorId = supervisor.id;

  const existing = supervisorTrackers.get(supervisorId);
  if (existing && existing.has(message.channel.id)) return;

  const supervisorMessages = ensureSupervisorMap(supervisorId);

  if (!supervisorMessages.has(message.channel.id)) {
    supervisorMessages.set(message.channel.id, new Map());
  }

  const channelMap = supervisorMessages.get(message.channel.id);

  const msgId = message.id;
  const userId = message.author.id;
  const msgLink = `https://discord.com/channels/${message.guildId}/${message.channel.id}/${message.id}`;

startSeniorTimer(
  supervisorId,
  userId,
  msgLink,
  message.guild.name,
  message.channel.id,
  supervisor
);


  const timers = {};

  timers.supervisorTimer = setTimeout(async () => {
    try {
      const supUser = await client.users.fetch(supervisorId);
      await supUser.send(
        `⏰ You have not replied to <@${userId}>\n<#${message.channel.id}>\n ${msgLink}`
      );

      timers.reminderTimer = setTimeout(async () => {
        await supUser.send(
          `⚠️ Reminder: Still no reply to <@${userId}>\n <#${message.channel.id}>.\n ${msgLink}`
        );

        timers.managerTimer = setTimeout(async () => {
          try {
            for (const mgrId of supervisor.managers) {
              const mgrUser = await client.users.fetch(mgrId);
              await mgrUser.send(
                `🚨 Clients <@${supervisorId}> has not replied in <#${message.channel.id}>.\n${msgLink}`
              );
            }
          } catch (err) {
            console.error("❌ Manager DM error:", err);
          }
        }, THIRD_REMINDER);

      }, SECOND_REMINDER);

    } catch (err) {
      console.error("❌ Supervisor DM error:", err);
    }
  }, FIRST_REMINDER);

  channelMap.set(msgId, {
    userId,
    messageLink: msgLink,
    timers
  });
});

// =========================================================
// EVENT — SUPERVISOR or MANAGER REPLY → CLEAR TIMERS
// =========================================================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const supervisor = getSupervisorByChannel(message.channel.id);
  if (!supervisor) return;

  const isSupervisor = message.author.id === supervisor.id;
  const isAssignedManager = supervisor.managers.includes(message.author.id);

  if (!isSupervisor && !isAssignedManager) return;

  const supervisorMessages = supervisorTrackers.get(supervisor.id);
  if (!supervisorMessages) return;

  const channelMap = supervisorMessages.get(message.channel.id);

  // Any manager clears timers only for this channel
if (!isSupervisor && ALL_MANAGERS.has(message.author.id)) {
  if (!channelMap) return;

  for (const [msgId, tracked] of channelMap.entries()) {
    const st = seniorTimers.get(tracked.messageLink);
    if (st) {
      clearTimeout(st);
      seniorTimers.delete(tracked.messageLink);
    }

    clearTimeout(tracked.timers.supervisorTimer);
    clearTimeout(tracked.timers.reminderTimer);
    clearTimeout(tracked.timers.managerTimer);

    channelMap.delete(msgId);
  }

  if (channelMap.size === 0) supervisorMessages.delete(message.channel.id);
  if (supervisorMessages.size === 0) supervisorTrackers.delete(supervisor.id);

  return;
}



  // Supervisor clears channel timers only
  if (!channelMap) return;

  for (const [msgId, tracked] of channelMap.entries()) {
    const st = seniorTimers.get(tracked.messageLink);
    if (st) {
      clearTimeout(st);
      seniorTimers.delete(tracked.messageLink);
    }

    clearTimeout(tracked.timers.supervisorTimer);
    clearTimeout(tracked.timers.reminderTimer);
    clearTimeout(tracked.timers.managerTimer);

    channelMap.delete(msgId);
  }

  if (channelMap.size === 0) supervisorMessages.delete(message.channel.id);
  if (supervisorMessages.size === 0) supervisorTrackers.delete(supervisor.id);
});

// =========================================================
// EVENT — REACTION BY SUPERVISOR OR MANAGER → CLEAR TIMERS
// =========================================================
client.on("messageReactionAdd", async (reaction, user) => {
  if (user.bot) return;

  const message = reaction.message;
  const supervisor = getSupervisorByChannel(message.channel.id);
  if (!supervisor) return;

  const isSupervisor = user.id === supervisor.id;
const isAnyManager = ALL_MANAGERS.has(user.id);

if (!isSupervisor && !isAnyManager) return;


  const supervisorMessages = supervisorTrackers.get(supervisor.id);
  if (!supervisorMessages) return;

  const channelMap = supervisorMessages.get(message.channel.id);
  if (!channelMap) return;

  for (const [msgId, tracked] of channelMap.entries()) {
    const st = seniorTimers.get(tracked.messageLink);
    if (st) {
      clearTimeout(st);
      seniorTimers.delete(tracked.messageLink);
    }

    clearTimeout(tracked.timers.supervisorTimer);
    clearTimeout(tracked.timers.reminderTimer);
    clearTimeout(tracked.timers.managerTimer);

    channelMap.delete(msgId);
  }

  if (channelMap.size === 0) supervisorMessages.delete(message.channel.id);
  if (supervisorMessages.size === 0) supervisorTrackers.delete(supervisor.id);
});

// =========================================================
// CLEANUP
// =========================================================
process.on("SIGINT", () => {
  for (const [, supMap] of supervisorTrackers) {
    for (const [, channelMap] of supMap) {
      for (const [, tracked] of channelMap) {
        clearTimeout(tracked.timers.supervisorTimer);
        clearTimeout(tracked.timers.reminderTimer);
        clearTimeout(tracked.timers.managerTimer);
      }
    }
  }
  for (const [, t] of seniorTimers) clearTimeout(t);
  process.exit();
});

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);
