/**
 * Klaviyo Deliverability Score Calculator
 * 
 * Calculates an accurate deliverability score using Klaviyo's Reporting API
 * Based on 5 key metrics: Open Rate, Click Rate, Bounce Rate, Unsubscribe Rate, and Spam Complaint Rate
 */

class KlaviyoDeliverabilityCalculator {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://a.klaviyo.com/api';
    this.revision = '2024-07-15';
    
    // Klaviyo's benchmark thresholds for deliverability scoring
    // Based on official Klaviyo documentation
    this.thresholds = {
      openRate: { 
        excellent: 0.33,  // Above 33% 
        good: 0.25,       // 25-33%
        fair: 0.15        // 15-25%
      },
      clickRate: { 
        excellent: 0.012, // Above 1.2%
        good: 0.008,      // 0.8-1.2%
        fair: 0.004       // 0.4-0.8%
      },
      bounceRate: { 
        excellent: 0.01,  // Below 1%
        good: 0.02,       // 1-2%
        fair: 0.05        // 2-5%
      },
      unsubscribeRate: { 
        excellent: 0.003, // Below 0.3%
        good: 0.005,      // 0.3-0.5%
        fair: 0.01        // 0.5-1%
      },
      spamComplaintRate: { 
        excellent: 0.0001, // Below 0.01%
        good: 0.0005,      // 0.01-0.05%
        fair: 0.001        // 0.05-0.1%
      }
    };
    
    // Weights for each metric (adjusted to match Klaviyo's scoring more closely)
    this.weights = {
      openRate: 0.20,
      clickRate: 0.25,      // Higher weight - this impacts score significantly
      bounceRate: 0.25,
      unsubscribeRate: 0.15,
      spamComplaintRate: 0.15
    };
  }

  /**
   * Fetches all metrics to find the Placed Order metric ID
   */
  async findPlacedOrderMetricId() {
    const url = `${this.baseUrl}/metrics/`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Klaviyo-API-Key ${this.apiKey}`,
        'accept': 'application/json',
        'revision': this.revision
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log('⚠️  Could not fetch metrics:', errorText);
      return null;
    }

    const data = await response.json();
    if (data.data && data.data.length > 0) {
      // Search for "Placed Order" or common conversion metrics
      const placedOrder = data.data.find(metric => 
        metric.attributes.name === 'Placed Order' ||
        metric.attributes.name === 'Ordered Product' ||
        metric.attributes.name.toLowerCase().includes('order')
      );
      
      if (placedOrder) {
        console.log(`   Found: "${placedOrder.attributes.name}" (ID: ${placedOrder.id})`);
        return placedOrder.id;
      }
      
      // If no order metric found, use the first available metric
      console.log(`   Using first available metric: "${data.data[0].attributes.name}" (ID: ${data.data[0].id})`);
      return data.data[0].id;
    }
    
    return null;
  }

  /**
   * Fetches campaign performance data from Klaviyo API
   */
  async fetchCampaignMetrics(timeframe = 'last_30_days', conversionMetricId) {
    const url = `${this.baseUrl}/campaign-values-reports/`;
    
    const attributes = {
      timeframe: {
        key: timeframe
      },
      statistics: [
        'open_rate',
        'click_rate',
        'bounce_rate',
        'unsubscribe_rate',
        'spam_complaint_rate',
        'opens_unique',
        'clicks_unique',
        'bounced',
        'unsubscribe_uniques',
        'spam_complaints',
        'recipients'
      ]
    };

    // Only add conversion_metric_id if provided
    if (conversionMetricId) {
      attributes.conversion_metric_id = conversionMetricId;
    }

    const requestBody = {
      data: {
        type: 'campaign-values-report',
        attributes: attributes
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Klaviyo-API-Key ${this.apiKey}`,
        'accept': 'application/json',
        'content-type': 'application/json',
        'revision': this.revision
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Campaign API Error: ${response.status} - ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Fetches flow performance data from Klaviyo API
   */
  async fetchFlowMetrics(timeframe = 'last_30_days', conversionMetricId) {
    const url = `${this.baseUrl}/flow-values-reports/`;
    
    const attributes = {
      timeframe: {
        key: timeframe
      },
      statistics: [
        'open_rate',
        'click_rate',
        'bounce_rate',
        'unsubscribe_rate',
        'spam_complaint_rate',
        'opens_unique',
        'clicks_unique',
        'bounced',
        'unsubscribe_uniques',
        'spam_complaints',
        'recipients'
      ]
    };

    // Only add conversion_metric_id if provided
    if (conversionMetricId) {
      attributes.conversion_metric_id = conversionMetricId;
    }

    const requestBody = {
      data: {
        type: 'flow-values-report',
        attributes: attributes
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Klaviyo-API-Key ${this.apiKey}`,
        'accept': 'application/json',
        'content-type': 'application/json',
        'revision': this.revision
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Flow API Error: ${response.status} - ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Aggregates metrics using Klaviyo's pre-calculated rates (weighted by recipients)
   * This matches how Klaviyo calculates account-level metrics
   */
  aggregateMetrics(results) {
    let weightedRates = {
      openRate: 0,
      clickRate: 0,
      bounceRate: 0,
      unsubscribeRate: 0,
      spamComplaintRate: 0,
      totalWeight: 0
    };

    let totals = {
      opens_unique: 0,
      clicks_unique: 0,
      bounced: 0,
      unsubscribe_uniques: 0,
      spam_complaints: 0,
      recipients: 0,
      delivered: 0
    };

    results.forEach(result => {
      const stats = result.statistics;
      const weight = stats.recipients || 0;
      
      if (weight > 0) {
        // Use Klaviyo's pre-calculated rates, weighted by recipients
        weightedRates.openRate += (stats.open_rate || 0) * weight;
        weightedRates.clickRate += (stats.click_rate || 0) * weight;
        weightedRates.bounceRate += (stats.bounce_rate || 0) * weight;
        weightedRates.unsubscribeRate += (stats.unsubscribe_rate || 0) * weight;
        weightedRates.spamComplaintRate += (stats.spam_complaint_rate || 0) * weight;
        weightedRates.totalWeight += weight;
      }
      
      // Also collect raw totals for display
      totals.opens_unique += stats.opens_unique || 0;
      totals.clicks_unique += stats.clicks_unique || 0;
      totals.bounced += stats.bounced || 0;
      totals.unsubscribe_uniques += stats.unsubscribe_uniques || 0;
      totals.spam_complaints += stats.spam_complaints || 0;
      totals.recipients += stats.recipients || 0;
    });

    totals.delivered = totals.recipients - totals.bounced;
    
    // Calculate weighted average rates
    const totalWeight = weightedRates.totalWeight || 1;
    
    return {
      openRate: weightedRates.openRate / totalWeight,
      clickRate: weightedRates.clickRate / totalWeight,
      bounceRate: weightedRates.bounceRate / totalWeight,
      unsubscribeRate: weightedRates.unsubscribeRate / totalWeight,
      spamComplaintRate: weightedRates.spamComplaintRate / totalWeight,
      totals,
      delivered: totals.delivered
    };
  }

  /**
   * Calculates a score (0-100) for an individual metric
   * Uses a more aggressive penalty system to match Klaviyo's stricter scoring
   */
  calculateMetricScore(value, metricName, isNegative = false) {
    const threshold = this.thresholds[metricName];
    
    if (isNegative) {
      // For negative metrics (bounce, unsubscribe, spam) - lower is better
      if (value <= threshold.excellent) return 100;
      if (value <= threshold.good) return 90;
      if (value <= threshold.fair) return 75;
      
      // Steeper penalty for values above fair threshold
      const maxBad = threshold.fair * 2;
      if (value >= maxBad) return 30;
      return Math.max(30, 75 - ((value - threshold.fair) / (maxBad - threshold.fair)) * 45);
    } else {
      // For positive metrics (open, click) - higher is better
      if (value >= threshold.excellent) return 100;
      if (value >= threshold.good) return 90;
      if (value >= threshold.fair) return 75;
      
      // Steeper penalty below fair threshold
      if (value <= 0) return 30;
      const score = 30 + ((value / threshold.fair) * 45);
      return Math.max(30, Math.min(100, score));
    }
  }

  /**
   * Calculates the overall deliverability score
   */
  calculateDeliverabilityScore(metrics) {
    const scores = {
      openRate: this.calculateMetricScore(metrics.openRate, 'openRate', false),
      clickRate: this.calculateMetricScore(metrics.clickRate, 'clickRate', false),
      bounceRate: this.calculateMetricScore(metrics.bounceRate, 'bounceRate', true),
      unsubscribeRate: this.calculateMetricScore(metrics.unsubscribeRate, 'unsubscribeRate', true),
      spamComplaintRate: this.calculateMetricScore(metrics.spamComplaintRate, 'spamComplaintRate', true)
    };

    // Weighted average
    const overallScore = 
      scores.openRate * this.weights.openRate +
      scores.clickRate * this.weights.clickRate +
      scores.bounceRate * this.weights.bounceRate +
      scores.unsubscribeRate * this.weights.unsubscribeRate +
      scores.spamComplaintRate * this.weights.spamComplaintRate;

    return {
      overallScore: Math.round(overallScore),
      individualScores: scores,
      metrics
    };
  }

  /**
   * Gets health status based on score
   */
  getHealthStatus(score) {
    if (score >= 85) return { status: 'Excellent', color: '#00C853' };
    if (score >= 70) return { status: 'Good', color: '#64DD17' };
    if (score >= 50) return { status: 'Fair', color: '#FFA000' };
    if (score >= 30) return { status: 'Poor', color: '#FF6D00' };
    return { status: 'Critical', color: '#D50000' };
  }

  /**
   * Main method to calculate deliverability score
   */
  async calculateScore(options = {}) {
    const {
      timeframe = 'last_30_days',
      conversionMetricId = null,
      includeCampaigns = true,
      includeFlows = true,
      autoFindMetricId = true
    } = options;

    try {
      let metricId = conversionMetricId;

      // Auto-find Placed Order metric ID if not provided
      if (!metricId && autoFindMetricId) {
        console.log('🔍 Looking for "Placed Order" metric ID...');
        metricId = await this.findPlacedOrderMetricId();
        if (metricId) {
          console.log(`✅ Found metric ID: ${metricId}`);
        } else {
          console.log('⚠️  No "Placed Order" metric found. Running without conversion metrics.');
        }
      }

      const results = [];

      // Fetch campaign metrics
      if (includeCampaigns) {
        console.log('📧 Fetching campaign metrics...');
        const campaignData = await this.fetchCampaignMetrics(timeframe, metricId);
        if (campaignData.data?.attributes?.results) {
          results.push(...campaignData.data.attributes.results);
          console.log(`✅ Found ${campaignData.data.attributes.results.length} campaign(s)`);
        }
      }

      // Fetch flow metrics
      if (includeFlows) {
        console.log('🔄 Fetching flow metrics...');
        const flowData = await this.fetchFlowMetrics(timeframe, metricId);
        if (flowData.data?.attributes?.results) {
          results.push(...flowData.data.attributes.results);
          console.log(`✅ Found ${flowData.data.attributes.results.length} flow(s)`);
        }
      }

      if (results.length === 0) {
        throw new Error('No data available for the specified timeframe. Ensure you have sent emails in the last 30 days.');
      }

      console.log(`\n📊 Calculating deliverability score from ${results.length} source(s)...\n`);

      // Aggregate metrics
      const aggregatedMetrics = this.aggregateMetrics(results);

      // Calculate score
      const scoreData = this.calculateDeliverabilityScore(aggregatedMetrics);
      
      // Add health status
      const health = this.getHealthStatus(scoreData.overallScore);

      return {
        ...scoreData,
        health,
        timeframe,
        metricIdUsed: metricId,
        calculatedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Error calculating deliverability score:', error.message);
      throw error;
    }
  }

  /**
   * Formats the score report
   */
  formatReport(scoreData) {
    const { overallScore, individualScores, metrics, health, timeframe } = scoreData;
    
    return `
╔═══════════════════════════════════════════════════════════╗
║          KLAVIYO DELIVERABILITY SCORE REPORT              ║
╠═══════════════════════════════════════════════════════════╣
║ Overall Score: ${overallScore}/100 (${health.status})                     ║
║ Timeframe: ${timeframe}                                    ║
╠═══════════════════════════════════════════════════════════╣
║ METRIC BREAKDOWN:                                         ║
║                                                           ║
║ Open Rate:           ${(metrics.openRate * 100).toFixed(2)}% (Score: ${individualScores.openRate.toFixed(0)}/100) ║
║ Click Rate:          ${(metrics.clickRate * 100).toFixed(2)}% (Score: ${individualScores.clickRate.toFixed(0)}/100) ║
║ Bounce Rate:         ${(metrics.bounceRate * 100).toFixed(2)}% (Score: ${individualScores.bounceRate.toFixed(0)}/100) ║
║ Unsubscribe Rate:    ${(metrics.unsubscribeRate * 100).toFixed(3)}% (Score: ${individualScores.unsubscribeRate.toFixed(0)}/100) ║
║ Spam Complaint Rate: ${(metrics.spamComplaintRate * 100).toFixed(4)}% (Score: ${individualScores.spamComplaintRate.toFixed(0)}/100) ║
╠═══════════════════════════════════════════════════════════╣
║ RAW METRICS:                                              ║
║                                                           ║
║ Total Recipients:    ${metrics.totals.recipients.toLocaleString()}                       ║
║ Delivered:           ${metrics.delivered.toLocaleString()}                       ║
║ Unique Opens:        ${metrics.totals.opens_unique.toLocaleString()}                       ║
║ Unique Clicks:       ${metrics.totals.clicks_unique.toLocaleString()}                       ║
║ Bounces:             ${metrics.totals.bounced.toLocaleString()}                       ║
║ Unsubscribes:        ${metrics.totals.unsubscribe_uniques.toLocaleString()}                       ║
║ Spam Complaints:     ${metrics.totals.spam_complaints.toLocaleString()}                       ║
╚═══════════════════════════════════════════════════════════╝
    `.trim();
  }
}

// ============================================================
// CONFIGURATION - PUT YOUR CREDENTIALS HERE
// ============================================================

// 🔑 STEP 1: Put your Klaviyo Private API Key here
// Get it from: Klaviyo Dashboard > Settings > API Keys > Create Private API Key
const YOUR_API_KEY = 'pk_79414f685bdfcb0c4d1bb27a37d70ab65a'; // ✅ Your API Key added!

// 🎯 STEP 2: Put your Conversion Metric ID here (usually "Placed Order")
// Get it from: Klaviyo Dashboard > Analytics > Metrics > Click on "Placed Order" > Copy ID from URL
// OR just leave it as null to auto-find it!
const YOUR_METRIC_ID = null; // ← Set to null to auto-find, or paste your metric ID here

// ============================================================

// Example usage:
async function example() {
  // Create calculator instance with YOUR API key
  const calculator = new KlaviyoDeliverabilityCalculator(YOUR_API_KEY);
  
  try {
    console.log('🚀 Starting Klaviyo Deliverability Score Calculation...\n');
    
    // Calculate score - the metric ID will be found automatically!
    const score = await calculator.calculateScore({
      timeframe: 'last_30_days',          // Options: 'last_7_days', 'last_30_days', 'last_90_days', etc.
      conversionMetricId: YOUR_METRIC_ID, // null will auto-find "Placed Order" metric
      includeCampaigns: true,              // Include campaign data
      includeFlows: true,                  // Include flow data
      autoFindMetricId: true               // Automatically find "Placed Order" metric
    });
    
    // Print formatted report
    console.log(calculator.formatReport(score));
    
    // Return full data
    return score;
  } catch (error) {
    console.error('\n❌ Failed to calculate deliverability score:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Check your API key is correct');
    console.error('2. Ensure your API key has these scopes: campaigns:read, flows:read');
    console.error('3. Make sure you have sent emails in the last 30 days');
  }
}

// Export for use in Node.js or browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = KlaviyoDeliverabilityCalculator;
}

// Run example if executed directly
if (typeof require !== 'undefined' && require.main === module) {
  example();
}