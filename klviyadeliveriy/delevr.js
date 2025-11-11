require('dotenv').config();
const axios = require('axios');

const KLAVIYO_API_KEY = process.env.KLAVIYO_API_KEY;
const BASE_URL = 'https://a.klaviyo.com/api';

if (!KLAVIYO_API_KEY) {
  console.error('Set KLAVIYO_API_KEY in .env');
  process.exit(1);
}

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Authorization': `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
    'accept': 'application/json',
    'revision': '2024-10-15'
  }
});

// YOUR ACCOUNT'S REAL METRIC NAMES
const METRIC_MAP = {
  delivered: /received email/i,
  bounce: /bounced email/i,
  spam: /marked email as spam/i,
  opened: /opened email/i
};

let metricIdMap = {};

async function fetchMetricIds() {
  const res = await api.get('/metrics');
  const metrics = res.data.data;

  metricIdMap = {};

  metrics.forEach(m => {
    const name = m.attributes.name.toLowerCase();
    const id = m.id;

    if (METRIC_MAP.delivered.test(name)) metricIdMap.delivered = id;
    else if (METRIC_MAP.bounce.test(name)) metricIdMap.bounce = id;
    else if (METRIC_MAP.spam.test(name)) metricIdMap.spam = id;
    else if (METRIC_MAP.opened.test(name)) metricIdMap.opened = id;
  });

  console.log('Detected Metrics:');
  console.log(`  Received Email  → ${metricIdMap.delivered ? 'Found' : 'Missing'}`);
  console.log(`  Bounced Email   → ${metricIdMap.bounce ? 'Found' : 'Missing'}`);
  console.log(`  Marked as Spam  → ${metricIdMap.spam ? 'Found' : 'Missing'}`);
  console.log(`  Opened Email    → ${metricIdMap.opened ? 'Found' : 'Missing'}\n`);
}

async function getTotalCount(metricId, start, end) {
  if (!metricId) return 0;

  try {
    const res = await api.post('/metric-aggregates', {
      data: {
        type: 'metric-aggregate',
        attributes: {
          metric_id: metricId,
          measurements: ['count'],
          interval: 'day',
          filter: [
            `greater-or-equal(datetime,${start})`,
            `less-than(datetime,${end})`
          ],
          timezone: 'UTC'
        }
      }
    });

    return res.data.data.attributes.data.reduce((sum, day) => sum + (day.value || 0), 0);
  } catch (err) {
    console.error('API Error:', err.response?.data?.errors?.[0]?.detail || err.message);
    return 0;
  }
}

async function getDeliverabilityData() {
  await fetchMetricIds();

  const end = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

  const startStr = start.toISOString();
  const endStr = end.toISOString();

  console.log(`Querying last 30 days: ${startStr.split('T')[0]} → ${endStr.split('T')[0]}\n`);

  const stats = {
    delivered: await getTotalCount(metricIdMap.delivered, startStr, endStr),
    bounced: await getTotalCount(metricIdMap.bounce, startStr, endStr),
    spam: await getTotalCount(metricIdMap.spam, startStr, endStr),
    opened: await getTotalCount(metricIdMap.opened, startStr, endStr)
  };

  stats.sends = stats.delivered + stats.bounced;

  return stats;
}

function calculateScore(stats) {
  if (stats.sends === 0) return { score: 0, reason: 'No sends in last 30 days' };

  const bounceRate = stats.bounced / stats.sends;
  const spamRate = stats.spam / stats.sends;
  const openRate = stats.opened / Math.max(stats.delivered, 1);
  const deliveryRate = stats.delivered / stats.sends;

  let score = 100;
  if (bounceRate > 0.05) score -= 50;
  else if (bounceRate > 0.02) score -= 25;

  if (spamRate > 0.002) score -= 40;
  else if (spamRate > 0.0005) score -= 20;

  if (openRate > 0.25) score += 10;
  else if (openRate < 0.10) score -= 15;

  if (deliveryRate < 0.95) score -= 20;

  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    score,
    details: {
      bounceRate: (bounceRate * 100).toFixed(2) + '%',
      spamRate: (spamRate * 100).toFixed(3) + '%',
      openRate: (openRate * 100).toFixed(1) + '%',
      deliveryRate: (deliveryRate * 100).toFixed(1) + '%'
    }
  };
}

// Main
(async () => {
  console.log('Starting Klaviyo Deliverability Check...\n');
  const stats = await getDeliverabilityData();
  const result = calculateScore(stats);

  console.log(`Deliverability Score: ${result.score}/100`);
  if (result.reason) {
    console.log(`Reason: ${result.reason}`);
    return;
  }

  console.log('\nBreakdown:');
  console.log(`   • Bounce Rate: ${result.details.bounceRate}`);
  console.log(`   • Spam Rate: ${result.details.spamRate}`);
  console.log(`   • Open Rate: ${result.details.openRate}`);
  console.log(`   • Delivery Rate: ${result.details.deliveryRate}`);
  console.log(`\n   • Sends: ${stats.sends.toLocaleString()}`);
  console.log(`   • Received: ${stats.delivered.toLocaleString()}`);
  console.log(`   • Bounced: ${stats.bounced.toLocaleString()}`);
  console.log(`   • Spam: ${stats.spam.toLocaleString()}`);
  console.log(`   • Opened: ${stats.opened.toLocaleString()}`);
})();