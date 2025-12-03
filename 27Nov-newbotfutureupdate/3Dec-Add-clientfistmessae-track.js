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

// CONFIG
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

// TIMINGS
const FIRST_DM = 60000;      // 1 min
const REMINDER = 30000;      // 30 sec
const FINAL_MANAGER = 10000; // 10 sec

// MULTI-CHANNEL TRACKERS
// key = channelId, value = tracker object
const trackersByChannel = new Map();

function getSupervisorByChannel(channelId) {
  return SUPERVISORS.find((sup) => sup.channels.includes(channelId));
}

function clearChannelTimers(channelId) {
  const tracker = trackersByChannel.get(channelId);
  if (!tracker) return;

  clearTimeout(tracker.supervisorTimer);
  clearTimeout(tracker.reminderTimer);
  clearTimeout(tracker.managerTimer);

  trackersByChannel.delete(channelId);
}

// -------------------------------
// EVENT: CLIENT MESSAGE
// -------------------------------
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const supervisor = getSupervisorByChannel(message.channel.id);
  if (!supervisor) return;

  // If channel is already being tracked, ignore new messages
  if (trackersByChannel.has(message.channel.id)) return;

  // Create tracker for this channel
  const tracker = {
    channelId: message.channel.id,
    userId: message.author.id,
    supervisorId: supervisor.id,
    messageLink: `https://discord.com/channels/${message.guildId}/${message.channel.id}/${message.id}`,
    supervisorTimer: null,
    reminderTimer: null,
    managerTimer: null
  };

  trackersByChannel.set(message.channel.id, tracker);

  // ---- STEP 1: DM Supervisor ----
  tracker.supervisorTimer = setTimeout(async () => {
    try {
      const user = await client.users.fetch(supervisor.id);
      await user.send(
        `⏰ You haven't replied to <@${tracker.userId}>.\n${tracker.messageLink}`
      );

      // ---- STEP 2: Reminder ----
      tracker.reminderTimer = setTimeout(async () => {
        try {
          const user2 = await client.users.fetch(supervisor.id);
          await user2.send(
            `⚠️ Reminder: Still no reply to <@${tracker.userId}>.\n${tracker.messageLink}`
          );

          // ---- STEP 3: Manager Alert ----
          tracker.managerTimer = setTimeout(async () => {
            try {
              const mgr = await client.users.fetch(MANAGER_ID);
              await mgr.send(
                `🚨 Supervisor <@${tracker.supervisorId}> has not replied in channel <#${tracker.channelId}>.\n${tracker.messageLink}`
              );

              // FINISHED — allow tracking next client message
              trackersByChannel.delete(tracker.channelId);

            } catch (err) {
              console.error("Error sending manager DM:", err);
            }
          }, FINAL_MANAGER);

        } catch (err) {
          console.error("Error sending reminder:", err);
        }
      }, REMINDER);

    } catch (err) {
      console.error("Error sending supervisor DM:", err);
    }
  }, FIRST_DM);
});

// -------------------------------
// EVENT: SUPERVISOR OR MANAGER REPLY
// -------------------------------
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const isSupervisor = SUPERVISORS.some((s) => s.id === message.author.id);
  const isManager = message.author.id === MANAGER_ID;

  if (!isSupervisor && !isManager) return;

  const channelId = message.channel.id;

  if (!trackersByChannel.has(channelId)) return;

  // CLEAR ONLY THIS CHANNEL'S TIMERS
  clearChannelTimers(channelId);

  console.log(`✔ Timers cleared because ${message.author.id} replied in channel ${channelId}`);
});

client.login(process.env.DISCORD_TOKEN);
