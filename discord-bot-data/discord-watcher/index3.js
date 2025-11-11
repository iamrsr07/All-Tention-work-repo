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

// Store timers per message
const messageTrackers = new Map();

// HELPER FUNCTION
function getSupervisorByChannel(channelId) {
  return SUPERVISORS.find((sup) => sup.channels.includes(channelId));
}

// ✅ TIME WINDOW CHECK (9 AM – 5 PM EST)
function isWithinWorkingHours() {
  const now = new Date();
  // Convert to EST (UTC-5) — adjust for daylight saving if needed
  const estNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const hours = estNow.getHours();
  return hours >= 9 && hours < 17; // 9:00 <= time < 17:00
}

// EVENT: MESSAGE CREATE (track messages for supervisor reply)
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
  };

  messageTrackers.set(message.id, tracker);

  // Step 1: DM supervisor after 1 minute (only if within working hours)
  tracker.supervisorTimer = setTimeout(async () => {
    if (!isWithinWorkingHours()) {
      console.log("⏸ Outside working hours — skipping alert.");
      return;
    }

    try {
      const supUser = await client.users.fetch(supervisorId);
      await supUser.send(
        `⏰ Hey <@${supervisorId}>, you haven’t replied to <@${tracker.userId}>'s message yet!\nLink: ${tracker.messageLink}`
      );

      // Step 2: Reminder to supervisor after 30 seconds
      tracker.reminderTimer = setTimeout(async () => {
        if (!isWithinWorkingHours()) {
          console.log("⏸ Outside working hours — skipping reminder.");
          return;
        }

        try {
          const supUserReminder = await client.users.fetch(supervisorId);
          await supUserReminder.send(
            `⚠️ Reminder: You still haven’t replied to <@${tracker.userId}>'s message.\nLink: ${tracker.messageLink}`
          );

          // Step 3: DM manager after another 10 seconds
          tracker.managerDM = setTimeout(async () => {
            if (!isWithinWorkingHours()) {
              console.log("⏸ Outside working hours — skipping manager DM.");
              return;
            }

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
          console.error("Error sending supervisor reminder DM:", err);
        }
      }, THIRTY_SECONDS);

    } catch (err) {
      console.error("Error sending supervisor DM:", err);
    }
  }, ONE_MINUTE);
});

// EVENT: TRACK SUPERVISOR REPLY
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const supervisor = SUPERVISORS.find((sup) => sup.id === message.author.id);
  if (!supervisor) return;

  for (const [msgId, tracker] of messageTrackers) {
    if (tracker.supervisorId !== message.author.id) continue;
    if (tracker.replied) continue;
    if (!supervisor.channels.includes(message.channel.id)) continue;

    // Stop all timers if supervisor replied
    clearTimeout(tracker.supervisorTimer);
    clearTimeout(tracker.reminderTimer);
    clearTimeout(tracker.managerDM);

    tracker.replied = true;
    messageTrackers.delete(msgId);

    console.log(
      `✅ Supervisor <@${tracker.supervisorId}> replied to message ${msgId}. Timers cleared.`
    );
  }
});

// LOGIN
client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);
