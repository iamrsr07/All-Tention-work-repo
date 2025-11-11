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

// CONFIGURATION
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

// TIMERS
const ONE_MINUTE = 1 * 60 * 1000;
const THIRTY_SECONDS = 30 * 1000;
const TEN_SECONDS = 10 * 1000;

// Message tracking
const messageTrackers = new Map(); // Key: message.id
const supervisorStats = new Map(); // Key: supervisorId, Value: { totalResponseTime, count, avg }

// Helper
function getSupervisorByChannel(channelId) {
  return SUPERVISORS.find((sup) => sup.channels.includes(channelId));
}

// Event: Message Create (track messages)
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const supervisor = getSupervisorByChannel(message.channel.id);
  if (!supervisor) return;

  const supervisorId = supervisor.id;

  const tracker = {
    supervisorTimer: null,
    reminderTimer: null,
    managerDM: null,
    supervisorId,
    userId: message.author.id,
    messageLink: `https://discord.com/channels/${message.guildId}/${message.channel.id}/${message.id}`,
    replied: false,
    timestamp: Date.now(), // 🕒 store time message sent
  };

  messageTrackers.set(message.id, tracker);

  // --- Timers (same as before) ---
  tracker.supervisorTimer = setTimeout(async () => {
    try {
      const supUser = await client.users.fetch(supervisorId);
      await supUser.send(
        `⏰ Hey <@${supervisorId}>, you haven’t replied to <@${tracker.userId}>'s message yet!\nLink: ${tracker.messageLink}`
      );

      tracker.reminderTimer = setTimeout(async () => {
        try {
          const supUserReminder = await client.users.fetch(supervisorId);
          await supUserReminder.send(
            `⚠️ Reminder: You still haven’t replied to <@${tracker.userId}>'s message.\nLink: ${tracker.messageLink}`
          );

          tracker.managerDM = setTimeout(async () => {
            try {
              const manager = await client.users.fetch(MANAGER_ID);
              await manager.send(
                `🚨 Supervisor <@${supervisorId}> has not replied to <@${tracker.userId}>'s message.\nLink: ${tracker.messageLink}`
              );
            } catch (err) {
              console.error("Error sending manager DM:", err);
            }
          }, TEN_SECONDS);
        } catch (err) {
          console.error("Error sending reminder:", err);
        }
      }, THIRTY_SECONDS);
    } catch (err) {
      console.error("Error sending DM:", err);
    }
  }, ONE_MINUTE);
});

// Event: Supervisor Reply
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const supervisor = SUPERVISORS.find((sup) => sup.id === message.author.id);
  if (!supervisor) return;

  for (const [msgId, tracker] of messageTrackers) {
    if (tracker.supervisorId !== message.author.id) continue;
    if (tracker.replied) continue;
    if (!supervisor.channels.includes(message.channel.id)) continue;

    // Stop timers
    clearTimeout(tracker.supervisorTimer);
    clearTimeout(tracker.reminderTimer);
    clearTimeout(tracker.managerDM);
    tracker.replied = true;

    // ✅ Calculate response time
    const responseTime = Date.now() - tracker.timestamp;

    // 🧮 Update average for supervisor
    const stats = supervisorStats.get(tracker.supervisorId) || { totalResponseTime: 0, count: 0, avg: 0 };
    stats.totalResponseTime += responseTime;
    stats.count += 1;
    stats.avg = stats.totalResponseTime / stats.count;
    supervisorStats.set(tracker.supervisorId, stats);

    console.log(
      `✅ ${message.author.username} replied in ${(responseTime / 1000).toFixed(1)}s. Avg response: ${(stats.avg / 1000).toFixed(1)}s`
    );

    messageTrackers.delete(msgId);
  }
});

// 🧾 Command to show average response times (in any text channel)
client.on("messageCreate", async (message) => {
  if (message.content === "!avgtime") {
    let reply = "**📊 Supervisor Average Response Times:**\n";
    for (const [id, stats] of supervisorStats) {
      const user = await client.users.fetch(id);
      reply += `- ${user.username}: ${(stats.avg / 1000).toFixed(1)} seconds (based on ${stats.count} replies)\n`;
    }
    message.channel.send(reply);
  }
});

// LOGIN
client.login(process.env.DISCORD_TOKEN);
