/**
 * Klaviyo Deliverability Monitor with Discord Alerts
 * 
 * Monitors multiple Klaviyo accounts and sends Discord notifications
 * when deliverability metrics fall below thresholds
 */

class KlaviyoDeliverabilityMonitor {
  constructor(config) {
    this.accounts = config.accounts; // Array of {name, apiKey}
    this.discordWebhookUrl = config.discordWebhookUrl;
    this.baseUrl = 'https://a.klaviyo.com/api';
    this.revision = '2024-07-15';
    
    // Klaviyo's threshold criteria
    // Metrics below these are considered "poor" performance
    this.criticalThresholds = {
      openRate: 0.33,        // Below 33% is poor
      clickRate: 0.012,      // Below 1.2% is poor
      bounceRate: 0.01,      // Above 1% is poor
      unsubscribeRate: 0.003, // Above 0.3% is poor
      spamComplaintRate: 0.0001 // Above 0.01% is poor
    };

    // Warning thresholds (trigger early warnings)
    this.warningThresholds = {
      openRate: 0.25,        // Below 25% is concerning
      clickRate: 0.008,      // Below 0.8% is concerning
      bounceRate: 0.02,      // Above 2% is concerning
      unsubscribeRate: 0.005, // Above 0.5% is concerning
      spamComplaintRate: 0.0005 // Above 0.05% is concerning
    };
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
   * Get score grade and emoji
   */
  getScoreGrade(score) {
    if (score >= 90) return { grade: 'A+', emoji: '🟢', status: 'Excellent' };
    if (score >= 80) return { grade: 'A', emoji: '🟢', status: 'Great' };
    if (score >= 70) return { grade: 'B', emoji: '🟡', status: 'Good' };
    if (score >= 60) return { grade: 'C', emoji: '🟡', status: 'Fair' };
    if (score >= 50) return { grade: 'D', emoji: '🟠', status: 'Poor' };
    return { grade: 'F', emoji: '🔴', status: 'Critical' };
  }

  /**
   * Check if metrics are in poor/warning state
   */
  analyzeMetrics(metrics) {
    const issues = {
      critical: [],
      warning: []
    };

    // Check each metric against thresholds
    if (metrics.openRate < this.criticalThresholds.openRate) {
      issues.critical.push({
        metric: 'Open Rate',
        value: `${(metrics.openRate * 100).toFixed(2)}%`,
        threshold: '33%',
        status: '🔴 Critical'
      });
    } else if (metrics.openRate < this.warningThresholds.openRate) {
      issues.warning.push({
        metric: 'Open Rate',
        value: `${(metrics.openRate * 100).toFixed(2)}%`,
        threshold: '33%',
        status: '⚠️ Warning'
      });
    }

    if (metrics.clickRate < this.criticalThresholds.clickRate) {
      issues.critical.push({
        metric: 'Click Rate',
        value: `${(metrics.clickRate * 100).toFixed(2)}%`,
        threshold: '1.2%',
        status: '🔴 Critical'
      });
    } else if (metrics.clickRate < this.warningThresholds.clickRate) {
      issues.warning.push({
        metric: 'Click Rate',
        value: `${(metrics.clickRate * 100).toFixed(2)}%`,
        threshold: '1.2%',
        status: '⚠️ Warning'
      });
    }

    if (metrics.bounceRate > this.criticalThresholds.bounceRate) {
      issues.critical.push({
        metric: 'Bounce Rate',
        value: `${(metrics.bounceRate * 100).toFixed(2)}%`,
        threshold: '<1%',
        status: '🔴 Critical'
      });
    } else if (metrics.bounceRate > this.warningThresholds.bounceRate) {
      issues.warning.push({
        metric: 'Bounce Rate',
        value: `${(metrics.bounceRate * 100).toFixed(2)}%`,
        threshold: '<1%',
        status: '⚠️ Warning'
      });
    }

    if (metrics.unsubscribeRate > this.criticalThresholds.unsubscribeRate) {
      issues.critical.push({
        metric: 'Unsubscribe Rate',
        value: `${(metrics.unsubscribeRate * 100).toFixed(3)}%`,
        threshold: '<0.3%',
        status: '🔴 Critical'
      });
    } else if (metrics.unsubscribeRate > this.warningThresholds.unsubscribeRate) {
      issues.warning.push({
        metric: 'Unsubscribe Rate',
        value: `${(metrics.unsubscribeRate * 100).toFixed(3)}%`,
        threshold: '<0.3%',
        status: '⚠️ Warning'
      });
    }

    if (metrics.spamComplaintRate > this.criticalThresholds.spamComplaintRate) {
      issues.critical.push({
        metric: 'Spam Complaint Rate',
        value: `${(metrics.spamComplaintRate * 100).toFixed(4)}%`,
        threshold: '<0.01%',
        status: '🔴 Critical'
      });
    } else if (metrics.spamComplaintRate > this.warningThresholds.spamComplaintRate) {
      issues.warning.push({
        metric: 'Spam Complaint Rate',
        value: `${(metrics.spamComplaintRate * 100).toFixed(4)}%`,
        threshold: '<0.05%',
        status: '⚠️ Warning'
      });
    }

    return issues;
  }

  /**
   * Send Discord notification
   */
  async sendDiscordAlert(accountName, metrics, issues) {
    if (!this.discordWebhookUrl) {
      console.log('⚠️  No Discord webhook URL configured');
      return;
    }

    const hasCritical = issues.critical.length > 0;
    const hasWarning = issues.warning.length > 0;

    if (!hasCritical && !hasWarning) {
      return; // All good, no alert needed
    }

    const color = hasCritical ? 0xFF0000 : 0xFFA500; // Red for critical, orange for warning
    const title = hasCritical ? 
      `🚨 CRITICAL: ${accountName} Deliverability Alert` :
      `⚠️ WARNING: ${accountName} Deliverability Alert`;

    let description = hasCritical ?
      `**${accountName}** has critical deliverability issues that need immediate attention!\n\n` :
      `**${accountName}** is showing warning signs in deliverability metrics.\n\n`;

    // Add critical issues
    if (issues.critical.length > 0) {
      description += '**🔴 Critical Issues:**\n';
      issues.critical.forEach(issue => {
        description += `• **${issue.metric}**: ${issue.value} (Target: ${issue.threshold})\n`;
      });
      description += '\n';
    }

    // Add warnings
    if (issues.warning.length > 0) {
      description += '**⚠️ Warnings:**\n';
      issues.warning.forEach(issue => {
        description += `• **${issue.metric}**: ${issue.value} (Target: ${issue.threshold})\n`;
      });
      description += '\n';
    }

    // Add all metrics summary
    description += '**📊 All Metrics:**\n';
    description += `• Open Rate: ${(metrics.openRate * 100).toFixed(2)}%\n`;
    description += `• Click Rate: ${(metrics.clickRate * 100).toFixed(2)}%\n`;
    description += `• Bounce Rate: ${(metrics.bounceRate * 100).toFixed(2)}%\n`;
    description += `• Unsubscribe Rate: ${(metrics.unsubscribeRate * 100).toFixed(3)}%\n`;
    description += `• Spam Complaints: ${(metrics.spamComplaintRate * 100).toFixed(4)}%\n`;
    description += `\n📧 Total Recipients: ${metrics.totals.recipients.toLocaleString()}`;

    const embed = {
      title,
      description,
      color,
      timestamp: new Date().toISOString(),
      footer: {
        text: 'Klaviyo Deliverability Monitor'
      }
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

      const metrics = await this.fetchAccountMetrics(account.apiKey);

      if (metrics.error) {
        console.log(`❌ Error: ${metrics.error}`);
        continue;
      }

      // Analyze metrics
      const issues = this.analyzeMetrics(metrics);

      // Calculate and display deliverability score
      const score = this.calculateDeliverabilityScore(metrics);
      const scoreInfo = this.getScoreGrade(score);
      console.log(`\n${scoreInfo.emoji} DELIVERABILITY SCORE: ${score}/100 (Grade: ${scoreInfo.grade} - ${scoreInfo.status})\n`);

      // Display results
      console.log(`Open Rate: ${(metrics.openRate * 100).toFixed(2)}%`);
      console.log(`Click Rate: ${(metrics.clickRate * 100).toFixed(2)}%`);
      console.log(`Bounce Rate: ${(metrics.bounceRate * 100).toFixed(2)}%`);
      console.log(`Unsubscribe Rate: ${(metrics.unsubscribeRate * 100).toFixed(3)}%`);
      console.log(`Spam Complaint Rate: ${(metrics.spamComplaintRate * 100).toFixed(4)}%`);

      if (issues.critical.length > 0) {
        console.log(`\n🔴 ${issues.critical.length} CRITICAL issue(s) found!`);
        await this.sendDiscordAlert(account.name, metrics, issues);
      } else if (issues.warning.length > 0) {
        console.log(`\n⚠️  ${issues.warning.length} warning(s) found`);
        await this.sendDiscordAlert(account.name, metrics, issues);
      } else {
        console.log(`\n✅ All metrics healthy!`);
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
  discordWebhookUrl: 'https://discord.com/api/webhooks/1436302896269365331/nNYBwusEmJeRo42S4NMUOQYZjIyAgrGVb9u83saFhh60hTNqSBWLTtG1psrk1MXS3fJz',
  
  // Array of Klaviyo accounts to monitor
  accounts: [
    {
      name: 'Main Store',
      apiKey: 'pk_5656f025641fe415c1309909a1adae8120'
    },
    {
      name: 'Second Store',
      apiKey: 'pk_79414f685bdfcb0c4d1bb27a37d70ab65a'
    },
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

// Export for use as module
if (typeof module !== 'undefined' && module.exports) {
  module.exports = KlaviyoDeliverabilityMonitor;
}