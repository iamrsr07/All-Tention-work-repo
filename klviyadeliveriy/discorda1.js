/**
 * Klaviyo Deliverability Monitor with Discord Alerts
 * 
 * Monitors multiple Klaviyo accounts and sends Discord notifications
 * when deliverability score falls below 70%
 */

class KlaviyoDeliverabilityMonitor {
  constructor(config) {
    this.accounts = config.accounts; // Array of {name, apiKey}
    this.discordWebhookUrl = config.discordWebhookUrl;
    this.baseUrl = 'https://a.klaviyo.com/api';
    this.revision = '2024-07-15';
    
    // Score threshold for alerts
    this.scoreThreshold = 90; // Send alert if score below 70
  }

  /**
   * Fetch Klaviyo account name
   */
  async fetchAccountName(apiKey) {
    try {
      const response = await fetch(`${this.baseUrl}/accounts/`, {
        headers: {
          'Authorization': `Klaviyo-API-Key ${apiKey}`,
          'accept': 'application/json',
          'revision': this.revision
        }
      });

      if (!response.ok) {
        console.log(`⚠️  Could not fetch account name (${response.status})`);
        return null;
      }

      const data = await response.json();
      console.log('📋 Account API Response:', JSON.stringify(data, null, 2));
      
      if (data.data && data.data.length > 0) {
        const accountData = data.data[0];
        const attributes = accountData.attributes;
        
        // Try different possible name fields
        let accountName = null;
        if (attributes.contact_information?.default_sender_name) {
          accountName = attributes.contact_information.default_sender_name;
        } else if (attributes.contact_information?.organization_name) {
          accountName = attributes.contact_information.organization_name;
        } else if (attributes.contact_information?.website) {
          accountName = attributes.contact_information.website;
        }
        
        if (accountName && attributes.test_account) {
          accountName += ' (Test)';
        }
        
        return accountName;
      }
      return null;
    } catch (error) {
      console.log(`⚠️  Error fetching account name: ${error.message}`);
      return null;
    }
  }

  /**
   * Fetch metrics for a single account
   */
  async fetchAccountMetrics(apiKey) {
    try {
      // Find conversion metric ID
      const metricId = await this.findConversionMetric(apiKey);

      // Fetch campaigns
      const campaignData = await this.fetchCampaigns(apiKey, metricId);
      
      // Fetch flows
      const flowData = await this.fetchFlows(apiKey, metricId);

      // Combine results
      const allResults = [
        ...(campaignData.data?.attributes?.results || []),
        ...(flowData.data?.attributes?.results || [])
      ];

      if (allResults.length === 0) {
        return { error: 'No data available for last 30 days' };
      }

      // Calculate weighted metrics
      const metrics = this.calculateWeightedMetrics(allResults);
      return metrics;

    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Find conversion metric automatically
   */
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
        const orderMetric = data.data.find(m => 
          m.attributes.name === 'Placed Order' ||
          m.attributes.name.toLowerCase().includes('order')
        );
        return orderMetric ? orderMetric.id : data.data[0].id;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Fetch campaign data
   */
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

    const response = await fetch(`${this.baseUrl}/campaign-values-reports/`, {
      method: 'POST',
      headers: {
        'Authorization': `Klaviyo-API-Key ${apiKey}`,
        'accept': 'application/json',
        'content-type': 'application/json',
        'revision': this.revision
      },
      body: JSON.stringify({
        data: { type: 'campaign-values-report', attributes }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Campaign API Error: ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Fetch flow data
   */
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

    const response = await fetch(`${this.baseUrl}/flow-values-reports/`, {
      method: 'POST',
      headers: {
        'Authorization': `Klaviyo-API-Key ${apiKey}`,
        'accept': 'application/json',
        'content-type': 'application/json',
        'revision': this.revision
      },
      body: JSON.stringify({
        data: { type: 'flow-values-report', attributes }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Flow API Error: ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Calculate weighted average metrics (matches Klaviyo's method)
   */
  calculateWeightedMetrics(results) {
    let weighted = {
      openRate: 0, clickRate: 0, bounceRate: 0,
      unsubscribeRate: 0, spamComplaintRate: 0, totalWeight: 0
    };

    let totals = {
      opens_unique: 0, clicks_unique: 0, bounced: 0,
      unsubscribe_uniques: 0, spam_complaints: 0, recipients: 0
    };

    results.forEach(result => {
      const stats = result.statistics;
      const weight = stats.recipients || 0;
      
      if (weight > 0) {
        weighted.openRate += (stats.open_rate || 0) * weight;
        weighted.clickRate += (stats.click_rate || 0) * weight;
        weighted.bounceRate += (stats.bounce_rate || 0) * weight;
        weighted.unsubscribeRate += (stats.unsubscribe_rate || 0) * weight;
        weighted.spamComplaintRate += (stats.spam_complaint_rate || 0) * weight;
        weighted.totalWeight += weight;
      }
      
      totals.opens_unique += stats.opens_unique || 0;
      totals.clicks_unique += stats.clicks_unique || 0;
      totals.bounced += stats.bounced || 0;
      totals.unsubscribe_uniques += stats.unsubscribe_uniques || 0;
      totals.spam_complaints += stats.spam_complaints || 0;
      totals.recipients += stats.recipients || 0;
    });

    const tw = weighted.totalWeight || 1;
    
    return {
      openRate: weighted.openRate / tw,
      clickRate: weighted.clickRate / tw,
      bounceRate: weighted.bounceRate / tw,
      unsubscribeRate: weighted.unsubscribeRate / tw,
      spamComplaintRate: weighted.spamComplaintRate / tw,
      totals
    };
  }

  /**
   * Calculate overall deliverability score (0-100)
   */
  calculateDeliverabilityScore(metrics) {
    let score = 0;

    // Open Rate (30 points max) - Target: 33%+
    const openScore = Math.min((metrics.openRate / 0.40) * 30, 30);
    score += openScore;

    // Click Rate (25 points max) - Target: 1.2%+
    const clickScore = Math.min((metrics.clickRate / 0.02) * 25, 25);
    score += clickScore;

    // Bounce Rate (20 points max) - Target: <1%
    const bounceScore = metrics.bounceRate <= 0.01 ? 20 : Math.max(20 - (metrics.bounceRate * 2000), 0);
    score += bounceScore;

    // Unsubscribe Rate (15 points max) - Target: <0.3%
    const unsubScore = metrics.unsubscribeRate <= 0.003 ? 15 : Math.max(15 - (metrics.unsubscribeRate * 5000), 0);
    score += unsubScore;

    // Spam Complaint Rate (10 points max) - Target: <0.01%
    const spamScore = metrics.spamComplaintRate <= 0.0001 ? 10 : Math.max(10 - (metrics.spamComplaintRate * 100000), 0);
    score += spamScore;

    return Math.round(score);
  }

  /**
   * Send simplified Discord notification - only if score below 70%
   */
  async sendDiscordAlert(accountName, score) {
    if (!this.discordWebhookUrl) {
      console.log('⚠️  No Discord webhook URL configured');
      return;
    }

    // Only send if score is below threshold
    if (score >= this.scoreThreshold) {
      return;
    }

    // Simple hardcoded message
    const message = `⚠️ **${accountName}** deliverability score is below 70%. Please check your account.`;

    const embed = {
      description: message,
      color: 0xFFA500, // Orange color
      timestamp: new Date().toISOString()
    };

    try {
      const response = await fetch(this.discordWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [embed] })
      });

      if (response.ok) {
        console.log(`✅ Discord alert sent for ${accountName}`);
      } else {
        console.error(`❌ Failed to send Discord alert: ${response.status}`);
      }
    } catch (error) {
      console.error(`❌ Discord webhook error:`, error.message);
    }
  }

  /**
   * Monitor all accounts and send alerts
   */
  async monitorAll() {
    console.log(`\n🔍 Starting Klaviyo Deliverability Monitor`);
    console.log(`📅 ${new Date().toLocaleString()}`);
    console.log(`👥 Monitoring ${this.accounts.length} account(s)\n`);

    for (const account of this.accounts) {
      console.log(`\n📧 Checking: ${account.name}`);
      console.log('─'.repeat(50));

      // Fetch real Klaviyo account name
      const klaviyoAccountName = await this.fetchAccountName(account.apiKey);
      const displayName = klaviyoAccountName || account.name;
      
      if (klaviyoAccountName) {
        console.log(`🏷️  Klaviyo Account: ${klaviyoAccountName}`);
      }

      const metrics = await this.fetchAccountMetrics(account.apiKey);

      if (metrics.error) {
        console.log(`❌ Error: ${metrics.error}`);
        continue;
      }

      // Calculate deliverability score
      const score = this.calculateDeliverabilityScore(metrics);

      // Display score
      console.log(`\n📊 DELIVERABILITY SCORE: ${score}/100\n`);

      // Display metrics
      console.log(`Open Rate: ${(metrics.openRate * 100).toFixed(2)}%`);
      console.log(`Click Rate: ${(metrics.clickRate * 100).toFixed(2)}%`);
      console.log(`Bounce Rate: ${(metrics.bounceRate * 100).toFixed(2)}%`);
      console.log(`Unsubscribe Rate: ${(metrics.unsubscribeRate * 100).toFixed(3)}%`);
      console.log(`Spam Complaint Rate: ${(metrics.spamComplaintRate * 100).toFixed(4)}%`);

      // Send alert if score below 70%
      if (score < this.scoreThreshold) {
        console.log(`\n⚠️  Score below ${this.scoreThreshold}% - Sending Discord alert...`);
        await this.sendDiscordAlert(displayName, score);
      } else {
        console.log(`\n✅ Score above ${this.scoreThreshold}% - No alert needed`);
      }
    }

    console.log(`\n✨ Monitoring complete!\n`);
  }
}

// ============================================================
// CONFIGURATION
// ============================================================

const config = {
  // Your Discord webhook URL for alerts
  discordWebhookUrl: 'https://discordapp.com/api/webhooks/1427959656147325009/fOXHQhvS7ksP235hj5N5DtLOM6RYVLM1XulhCqu-VrYn-m_-RFzhCMxeC6G1mHdAgZkW',
  
  // Array of Klaviyo accounts to monitor
  accounts: [
    {
      name: 'First',
      apiKey: 'pk_5656f025641fe415c1309909a1adae8120'
    },
    {
      name: 'Second ',
      apiKey: 'pk_79414f685bdfcb0c4d1bb27a37d70ab65a'
    },{
      name: 'Second Third',
      apiKey: 'pk_8b639a517aa6e28e8ac256888f15d38d3d'
    }
    // Add more accounts as needed
  ]
};

// ============================================================
// RUN MONITOR
// ============================================================

async function runMonitor() {
  const monitor = new KlaviyoDeliverabilityMonitor(config);
  await monitor.monitorAll();
}

// Run immediately
runMonitor();

// Optional: Schedule to run every 24 hours
// setInterval(runMonitor, 24 * 60 * 60 * 1000);
setInterval(runMonitor, 60 * 1000);


// Export for use as module
if (typeof module !== 'undefined' && module.exports) {
  module.exports = KlaviyoDeliverabilityMonitor;
}