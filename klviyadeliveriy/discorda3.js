import fetch from "node-fetch";
import fs from "fs";

// ==========================
// CONFIGURATION
// ==========================
const DISCORD_WEBHOOK_URL =  "https://discordapp.com/api/webhooks/1427959656147325009/fOXHQhvS7ksP235hj5N5DtLOM6RYVLM1XulhCqu-VrYn-m_-RFzhCMxeC6G1mHdAgZkW"
  
const KLAVIYO_API_KEYS = [
  { name: "Account 1", key: "pk_5656f025641fe415c1309909a1adae8120" },
  { name: "Account 2", key: "pk_79414f685bdfcb0c4d1bb27a37d70ab65a" },
];

const ALERT_THRESHOLD = 90;
const ALERTS_FILE = "./alerts.json";

// ==========================
// LOAD LAST ALERT STATE
// ==========================
let lastAlerts = {};
try {
  if (fs.existsSync(ALERTS_FILE)) {
    lastAlerts = JSON.parse(fs.readFileSync(ALERTS_FILE, "utf8"));
  }
} catch (err) {
  console.error("⚠️ Could not read alerts file:", err);
  lastAlerts = {};
}

// ==========================
// HELPER FUNCTIONS
// ==========================
async function sendDiscordMessage(content) {
  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  } catch (err) {
    console.error("❌ Discord message failed:", err);
  }
}

async function fetchDeliverabilityScore(apiKey) {
  const url = "https://a.klaviyo.com/api/metric-aggregates/";
  const params = {
    metric_ids: [
      "open_rate",
      "click_rate",
      "bounce_rate",
      "unsubscribe_rate",
      "spam_rate",
    ],
  };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Klaviyo-API-Key ${apiKey}`,
        accept: "application/json",
        "content-type": "application/json",
        revision: "2023-10-15",
      },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      throw new Error(`Klaviyo API error ${res.status}`);
    }

    const data = await res.json();
    // Just fake a calculation (replace with your real logic)
    const score =
      100 -
      Math.random() * 50; // dummy value: replace with actual calculation logic
    return Math.round(score);
  } catch (err) {
    console.error("❌ Error fetching Klaviyo data:", err);
    return null;
  }
}

// ==========================
// MAIN PROCESS
// ==========================
(async () => {
  for (const { name, key } of KLAVIYO_API_KEYS) {
    console.log(`⏳ Checking ${name}...`);
    const score = await fetchDeliverabilityScore(key);
    if (score === null) continue;

    console.log(`📊 ${name}: Deliverability = ${score}%`);

    const wasAlerted = lastAlerts[name] || false;

    // Case 1: score below threshold → new alert
    if (score < ALERT_THRESHOLD && !wasAlerted) {
      await sendDiscordMessage(
        `⚠️ **${name}** deliverability dropped to **${score}%**. Please check your sending health.`
      );
      lastAlerts[name] = true;
    }

    // Case 2: score recovered → send recovery message
    else if (score >= ALERT_THRESHOLD && wasAlerted) {
      await sendDiscordMessage(
        `✅ **${name}** has recovered — deliverability now **${score}%**!`
      );
      lastAlerts[name] = false;
    }
  }

  // Save alert states
  try {
    fs.writeFileSync(ALERTS_FILE, JSON.stringify(lastAlerts, null, 2));
  } catch (err) {
    console.error("⚠️ Could not save alerts file:", err);
  }

  console.log("✅ Done checking all accounts.");
})();
