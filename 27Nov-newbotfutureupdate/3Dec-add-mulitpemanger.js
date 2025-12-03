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

// =======================================================
// CONFIG: SUPERVISORS + THEIR MANAGERS
// =======================================================

const SUPERVISORS = [
  {
    id: "1235236826793381908",  // Supervisor 1
    channels: ["1427650466598354954", "1427651512477155398", "1431648677386260580"],
    managers: ["960685716852072458"]  // Managers allowed to clear
  },
  {
    id: "1427987539691835442",  // Supervisor 2
    channels: ["1427650949954142239", "1427651063393030214"],
    managers: ["960685716852072458"]  // Only this manager clears
  },
];

// =======================================================
// TIMER SETTINGS
// =======================================================

const FIRST_DM = 60000;      // 1 min
const REMINDER = 30000;      // 30 sec
const FINAL_MANAGER = 10000; // 10 sec

// Trackers per channel
const trackersByChannel = new Map();

// =======================================================
// HELPER FUNCTIONS
// =======================================================

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

// =======================================================
// EVENT: CLIENT MESSAGE (CUSTOMER MESSAGE)
// =======================================================

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const supervisor = getSupervisorByChannel(message.channel.id);
  if (!supervisor) return;

  // Already tracking? Ignore
  if (trackersByChannel.has(message.channel.id)) return;

  // Create new tracking object
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

  // ================================
  // STEP 1 — DM Supervisor
  // ================================
  tracker.supervisorTimer = setTimeout(async () => {
    try {
      const supUser = await client.users.fetch(supervisor.id);
      await supUser.send(
        `⏰ You haven't replied to <@${tracker.userId}>.\n${tracker.messageLink}`
      );

      // ================================
      // STEP 2 — Reminder DM
      // ================================
      tracker.reminderTimer = setTimeout(async () => {
        try {
          const supUser2 = await client.users.fetch(supervisor.id);
          await supUser2.send(
            `⚠️ Reminder: Still no reply to <@${tracker.userId}>.\n${tracker.messageLink}`
          );

          // ================================
          // STEP 3 — Manager Alert
          // ================================
          tracker.managerTimer = setTimeout(async () => {
            try {
              // Send DM to ALL managers for THIS supervisor
              for (const mgrId of supervisor.managers) {
                const mgr = await client.users.fetch(mgrId);
                await mgr.send(
                  `🚨 Supervisor <@${tracker.supervisorId}> has not replied in <#${tracker.channelId}>.\n${tracker.messageLink}`
                );
              }

              trackersByChannel.delete(tracker.channelId);

            } catch (err) {
              console.error("Error sending manager DM:", err);
            }
          }, FINAL_MANAGER);

        } catch (err) {
          console.error("Error sending reminder DM:", err);
        }
      }, REMINDER);

    } catch (err) {
      console.error("Error sending first DM:", err);
    }
  }, FIRST_DM);
});

// =======================================================
// EVENT: SUPERVISOR OR MANAGER REPLY
// =======================================================

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const channelId = message.channel.id;

  const supervisor = getSupervisorByChannel(channelId);
  if (!supervisor) return;

  // Is author the SUPERVISOR?
  const isSupervisor = message.author.id === supervisor.id;

  // Is author a MANAGER ASSIGNED TO THIS SUPERVISOR?
  const isManager =
    supervisor.managers &&
    supervisor.managers.includes(message.author.id);

  // If not supervisor or assigned manager → ignore
  if (!isSupervisor && !isManager) return;

  // If timers exist, clear them
  if (trackersByChannel.has(channelId)) {
    clearChannelTimers(channelId);
    console.log(
      `✔ Timer cleared because ${message.author.id} replied in channel ${channelId}`
    );
  }
});

client.login(process.env.DISCORD_TOKEN);
