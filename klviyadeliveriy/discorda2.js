import fs from 'fs';

/**
 * Klaviyo Deliverability Monitor with Smart Discord Alerts
 *
 * Sends an alert once when score drops below 70%,
 * and a recovery message once when it goes back above 70%.
 */
class KlaviyoDeliverabilityMonitor {
  constructor(config) {
    this.accounts = config.accounts;
    this.discordWebhookUrl = config.discordWebhookUrl;
    this.baseUrl = 'https://a.klaviyo.com/api';
    this.revision = '2024-07-15';
    this.scoreThreshold = 90;

    // Load previous alert states from file (so alerts persist across runs)
    this.alertStateFile = 'alerts.json';
    this.lastAlerts = this.loadAlertState();
  }

  /** Load saved alert state */
  loadAlertState() {
    try {
      if (fs.existsSync(this.alertStateFile)) {
        return JSON.parse(fs.readFileSync(this.alertStateFile, 'utf-8'));
      }
    } catch (e) {
      console.error('⚠️ Failed to load alert state:', e.message);
    }
    return {};
  }

  /** Save alert state */
  saveAlertState() {
    try {
      fs.writeFileSync(this.alertStateFile, JSON.stringify(this.lastAlerts, null, 2));
    } catch (e) {
      console.error('⚠️ Failed to save alert state:', e.message);
    }
  }

  async fetchAccountName(apiKey) {
    try {
      const response = await fetch(`${this.baseUrl}/accounts/`, {
        headers: {
          'Authorization': `Klaviyo-API-Key ${apiKey}`,
          'accept': 'application/json',
          'revision': this.revision
        }
      });

      if (!response.ok) return null;
      const data = await response.json();
      if (data.data && data.data.length > 0) {
        const attrs = data.data[0].attributes;
        let accountName = attrs.contact_information?.default_sender_name ||
                          attrs.contact_information?.organization_name ||
                          attrs.contact_information?.website || null;
        if (accountName && attrs.test_account) accountName += ' (Test)';
        return accountName;
      }
      return null;
    } catch (error) {
      console.log(`⚠️ Error fetching account name: ${error.message}`);
      return null;
    }
  }

  async fetchAccountMetrics(apiKey) {
    try {
      const metricId = await this.findConversionMetric(apiKey);
      const campaignData = await this.fetchCampaigns(apiKey, metricId);
      const flowData = await this.fetchFlows(apiKey, metricId);
      const allResults = [
        ...(campaignData.data?.attributes?.results || []),
        ...(flowData.data?.attributes?.results || [])
      ];
      if (allResults.length === 0) return { error: 'No data for last 30 days' };
      return this.calculateWeightedMetrics(allResults);
    } catch (error) {
      return { error: error.message };
    }
  }

  async findConversionMetric(apiKey) {
    try {
      const response = await fetch(`${this.baseUrl}/metrics/`, {
        headers: {
          'Authorization': `Klaviyo-API-Key ${apiKey}`,
          'accept': 'application/json',
          'revision': this.revision
        }
      });
      if (!response.ok) return null;
      const data = await response.json();
      if (data.data && data.data.length > 0) {
        const metric = data.data.find(m => m.attributes.name === 'Placed Order' || m.attributes.name.toLowerCase().includes('order'));
        return metric ? metric.id : data.data[0].id;
      }
      return null;
    } catch {
      return null;
    }
  }

  async fetchCampaigns(apiKey, metricId) {
    const attributes = {
      timeframe: { key: 'last_30_days' },
      statistics: [
        'open_rate', 'click_rate', 'bounce_rate',
        'unsubscribe_rate', 'spam_complaint_rate',
        'recipients', 'opens_unique', 'clicks_unique',
        'bounced', 'unsubscribe_uniques', 'spam_complaints'
      ]
    };
    if (metricId) attributes.conversion_metric_id = metricId;
    const res = await fetch(`${this.baseUrl}/campaign-values-reports/`, {
      method: 'POST',
      headers: {
        'Authorization': `Klaviyo-API-Key ${apiKey}`,
        'accept': 'application/json',
        'content-type': 'application/json',
        'revision': this.revision
      },
      body: JSON.stringify({ data: { type: 'campaign-values-report', attributes } })
    });
    if (!res.ok) throw new Error(`Campaign API Error: ${res.status}`);
    return await res.json();
  }

  async fetchFlows(apiKey, metricId) {
    const attributes = {
      timeframe: { key: 'last_30_days' },
      statistics: [
        'open_rate', 'click_rate', 'bounce_rate',
        'unsubscribe_rate', 'spam_complaint_rate',
        'recipients', 'opens_unique', 'clicks_unique',
        'bounced', 'unsubscribe_uniques', 'spam_complaints'
      ]
    };
    if (metricId) attributes.conversion_metric_id = metricId;
    const res = await fetch(`${this.baseUrl}/flow-values-reports/`, {
      method: 'POST',
      headers: {
        'Authorization': `Klaviyo-API-Key ${apiKey}`,
        'accept': 'application/json',
        'content-type': 'application/json',
        'revision': this.revision
      },
      body: JSON.stringify({ data: { type: 'flow-values-report', attributes } })
    });
    if (!res.ok) throw new Error(`Flow API Error: ${res.status}`);
    return await res.json();
  }

  calculateWeightedMetrics(results) {
    let weighted = { openRate: 0, clickRate: 0, bounceRate: 0, unsubscribeRate: 0, spamComplaintRate: 0, totalWeight: 0 };
    results.forEach(result => {
      const s = result.statistics;
      const w = s.recipients || 0;
      if (w > 0) {
        weighted.openRate += (s.open_rate || 0) * w;
        weighted.clickRate += (s.click_rate || 0) * w;
        weighted.bounceRate += (s.bounce_rate || 0) * w;
        weighted.unsubscribeRate += (s.unsubscribe_rate || 0) * w;
        weighted.spamComplaintRate += (s.spam_complaint_rate || 0) * w;
        weighted.totalWeight += w;
      }
    });
    const tw = weighted.totalWeight || 1;
    return {
      openRate: weighted.openRate / tw,
      clickRate: weighted.clickRate / tw,
      bounceRate: weighted.bounceRate / tw,
      unsubscribeRate: weighted.unsubscribeRate / tw,
      spamComplaintRate: weighted.spamComplaintRate / tw
    };
  }

  calculateDeliverabilityScore(m) {
    let score = 0;
    score += Math.min((m.openRate / 0.4) * 30, 30);
    score += Math.min((m.clickRate / 0.02) * 25, 25);
    score += m.bounceRate <= 0.01 ? 20 : Math.max(20 - (m.bounceRate * 2000), 0);
    score += m.unsubscribeRate <= 0.003 ? 15 : Math.max(15 - (m.unsubscribeRate * 5000), 0);
    score += m.spamComplaintRate <= 0.0001 ? 10 : Math.max(10 - (m.spamComplaintRate * 100000), 0);
    return Math.round(score);
  }

  async sendDiscordAlert(accountName, message, color = 0xFFA500) {
    if (!this.discordWebhookUrl) return;
    const embed = { description: message, color, timestamp: new Date().toISOString() };
    try {
      const res = await fetch(this.discordWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [embed] })
      });
      if (res.ok) console.log(`✅ Discord alert sent for ${accountName}`);
      else console.error(`❌ Discord alert failed: ${res.status}`);
    } catch (err) {
      console.error(`❌ Discord webhook error: ${err.message}`);
    }
  }

  async monitorAll() {
    console.log(`\n🔍 Starting Klaviyo Deliverability Monitor`);
    console.log(`📅 ${new Date().toLocaleString()}`);

    for (const account of this.accounts) {
      console.log(`\n📧 Checking: ${account.name}`);
      console.log('─'.repeat(50));

      const klaviyoName = await this.fetchAccountName(account.apiKey);
      const displayName = klaviyoName || account.name;

      const metrics = await this.fetchAccountMetrics(account.apiKey);
      if (metrics.error) {
        console.log(`❌ Error: ${metrics.error}`);
        continue;
      }

      const score = this.calculateDeliverabilityScore(metrics);
      console.log(`\n📊 DELIVERABILITY SCORE: ${score}/100`);

      const prevAlert = this.lastAlerts[displayName] || false;

      // 🔸 Case 1: score < threshold and alert not sent before
      if (score < this.scoreThreshold && !prevAlert) {
        const msg = `⚠️ **${displayName}** deliverability score dropped below 70%!`;
        await this.sendDiscordAlert(displayName, msg, 0xFF4500);
        this.lastAlerts[displayName] = true;
      }
      // 🔹 Case 2: score >= threshold and alert was active → recovery
      else if (score >= this.scoreThreshold && prevAlert) {
        const msg = `✅ **${displayName}** deliverability recovered above ${this.scoreThreshold}% (${score}%)`;
        await this.sendDiscordAlert(displayName, msg, 0x00FF00);
        this.lastAlerts[displayName] = false;
      } else {
        console.log(`ℹ️  No alert change for ${displayName}`);
      }

      // Save after each account check
      this.saveAlertState();
    }

    console.log(`\n✨ Monitoring complete!\n`);
  }
}

// ============================================================
// CONFIGURATION
// ============================================================

const config = {
  discordWebhookUrl: 'https://discordapp.com/api/webhooks/1434920891220885605/MzQupUKkfjcn0u7dYK7_3rFSplWRFCZhIafzJYowz9vbn8o8VuCoNHzy5CBVWZdAmprZ',
  accounts: [
    { name: 'First', apiKey: 'pk_5656f025641fe415c1309909a1adae8120' },
    { name: 'Second', apiKey: 'pk_79414f685bdfcb0c4d1bb27a37d70ab65a' },
    { name: 'Third', apiKey: 'pk_8b639a517aa6e28e8ac256888f15d38d3d' }
  ]
};

// ============================================================
// RUN MONITOR
// ============================================================

async function runMonitor() {
  const monitor = new KlaviyoDeliverabilityMonitor(config);
  await monitor.monitorAll();
}

runMonitor();

// Optionally schedule every 24h:
// setInterval(runMonitor, 24 * 60 * 60 * 1000);
setInterval(runMonitor, 60 * 1000);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = KlaviyoDeliverabilityMonitor;
}
