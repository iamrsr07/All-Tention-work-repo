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



const ONE_MINUTE = 1 * 60 * 1000; // 1 minute
const THIRTY_SECONDS = 30 * 1000; // 30 minutes

// Map to store latest pending message per supervisor
// Key: supervisorId, Value: { messageId, messageLink, userId, timers }
const supervisorTrackers = new Map();

// HELPER
function getSupervisorByChannel(channelId) {
  return SUPERVISORS.find((sup) => sup.channels.includes(channelId));
}

// EVENT: User sends a message in supervisor channel
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const supervisor = getSupervisorByChannel(message.channel.id);
  if (!supervisor) return;

  const supervisorId = supervisor.id;

  // Cancel any existing timers for this supervisor
  if (supervisorTrackers.has(supervisorId)) {
    const prev = supervisorTrackers.get(supervisorId);
    clearTimeout(prev.supervisorTimer);
    clearTimeout(prev.reminderTimer);
  }

  // Store latest message info
  const messageLink = `https://discord.com/channels/${message.guildId}/${message.channel.id}/${message.id}`;
  supervisorTrackers.set(supervisorId, {
    messageId: message.id,
    messageLink,
    userId: message.author.id,
    supervisorTimer: null,
    reminderTimer: null,
  });

  // Start 2-hour timer for supervisor DM
  const supTimer = setTimeout(async () => {
    try {
      const supUser = await client.users.fetch(supervisorId);
      await supUser.send(
        `⏰ Hey <@${supervisorId}>, you haven’t replied to <@${message.author.id}>'s message yet!\nLink: ${messageLink}`
      );

      // Start 30-min reminder → then manager DM
      const reminder = setTimeout(async () => {
        try {
          const supUserReminder = await client.users.fetch(supervisorId);
          await supUserReminder.send(
            `⚠️ Reminder: You still haven’t replied to <@${message.author.id}>'s message.\nLink: ${messageLink}`
          );

          const manager = await client.users.fetch(MANAGER_ID);
          await manager.send(
            `🚨 Supervisor <@${supervisorId}> still hasn’t replied to <@${message.author.id}>'s message.\nLink: ${messageLink}`
          );
        } catch (err) {
          console.error("Error sending reminder/manager DM:", err);
        }
      }, THIRTY_SECONDS);

      supervisorTrackers.get(supervisorId).reminderTimer = reminder;
    } catch (err) {
      console.error("Error sending supervisor DM:", err);
    }
  }, ONE_MINUTE);

  supervisorTrackers.get(supervisorId).supervisorTimer = supTimer;
});

// EVENT: Supervisor sends a message → cancel timers
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const supervisor = SUPERVISORS.find((sup) => sup.id === message.author.id);
  if (!supervisor) return;

  const tracker = supervisorTrackers.get(supervisor.id);
  if (!tracker) return;

  // Supervisor replied → cancel all timers
  clearTimeout(tracker.supervisorTimer);
  clearTimeout(tracker.reminderTimer);
  supervisorTrackers.delete(supervisor.id);

  console.log(
    `✅ Supervisor <@${message.author.id}> replied. Timers cleared for message ${tracker.messageId}.`
  );
});

client.login(process.env.DISCORD_TOKEN);
