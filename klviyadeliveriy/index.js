// Klaviyo Deliverability Score Calculator - CORRECTED VERSION
// Based on official Klaviyo methodology: Last 30 days data

const KLAVIYO_API_KEY = 'pk_5656f025641fe415c1309909a1adae8120';
const KLAVIYO_API_URL = 'https://a.klaviyo.com/api';
const API_REVISION = '2024-10-15';

/**
 * Delay helper
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry logic with exponential backoff
 */
async function fetchWithRetry(url, options, maxRetries = 5) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '2', 10);
        const waitTime = Math.min(retryAfter * 1000, 5000);
        console.log(`  ⏳ Rate limited. Waiting ${waitTime/1000}s (attempt ${attempt + 1}/${maxRetries})...`);
        await delay(waitTime);
        continue;
      }
      
      return response;
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      const waitTime = Math.min(1000 * Math.pow(2, attempt), 5000);
      console.log(`  ⚠️  Error on attempt ${attempt + 1}. Retrying in ${waitTime/1000}s...`);
      await delay(waitTime);
    }
  }
  throw new Error('Max retries exceeded');
}

/**
 * Test API connection
 */
async function testAPIConnection() {
  try {
    const response = await fetchWithRetry(`${KLAVIYO_API_URL}/accounts/`, {
      method: 'GET',
      headers: {
        'Authorization': `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
        'revision': API_REVISION,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API Connection Error ${response.status}:`, errorText);
      return false;
    }

    const data = await response.json();
    console.log('✓ API Connected successfully');
    console.log(`Account: ${data.data[0]?.attributes?.contact_information?.default_sender_name || 'N/A'}\n`);
    return true;
  } catch (error) {
    console.error('Connection failed:', error.message);
    return false;
  }
}

/**
 * Get all metrics and find the IDs we need
 */
async function getMetrics() {
  try {
    const response = await fetchWithRetry(`${KLAVIYO_API_URL}/metrics/`, {
      method: 'GET',
      headers: {
        'Authorization': `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
        'revision': API_REVISION,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      console.error('Failed to fetch metrics');
      return null;
    }

    const data = await response.json();
    const metrics = {};
    
    // Don't spam console with all metrics
    data.data.forEach(metric => {
      const name = metric.attributes?.name;
      const integration = metric.attributes?.integration?.name;
      
      // Only track Klaviyo native metrics
      if (integration && integration.toLowerCase() !== 'klaviyo') return;
      
      if (name === 'Received Email') metrics.received = metric.id;
      if (name === 'Opened Email') metrics.opened = metric.id;
      if (name === 'Clicked Email') metrics.clicked = metric.id;
      if (name === 'Bounced Email') metrics.bounced = metric.id;
      // Multiple possible names for unsubscribe
      if (name === 'Unsubscribed' || name === 'Unsubscribed from Email Marketing') {
        metrics.unsubscribed = metric.id;
      }
      if (name === 'Marked Email as Spam') metrics.spam = metric.id;
    });
    
    console.log('\n✓ Tracking these Klaviyo metrics:', metrics, '\n');
    return metrics;
  } catch (error) {
    console.error('Error fetching metrics:', error.message);
    return null;
  }
}

/**
 * Get aggregated metrics data - FIXED VERSION
 */
async function getMetricAggregates(metricId, metricName, startDate, endDate) {
  if (!metricId) {
    console.log(`⚠️  Skipping ${metricName} - metric ID not found`);
    return {};
  }

  try {
    console.log(`Fetching ${metricName}...`);
    
    const requestBody = {
      data: {
        type: 'metric-aggregate',
        attributes: {
          metric_id: metricId,
          measurements: ['count', 'unique'],
          filter: [
            `greater-or-equal(datetime,${startDate})`,
            `less-than(datetime,${endDate})`
          ],
          by: ['$message'],
          timezone: 'UTC'
        }
      }
    };

    const response = await fetchWithRetry(`${KLAVIYO_API_URL}/metric-aggregates/`, {
      method: 'POST',
      headers: {
        'Authorization': `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
        'revision': API_REVISION,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`  └─ Failed (${response.status}):`, errorText.substring(0, 200));
      return {};
    }

    const data = await response.json();
    const aggregates = {};
    
    if (data.data?.attributes?.data) {
      data.data.attributes.data.forEach(item => {
        const messageId = item.dimensions?.[0];
        if (messageId) {
          aggregates[messageId] = {
            count: item.measurements?.count?.[0] || 0,
            unique: item.measurements?.unique?.[0] || 0
          };
        }
      });
    }
    
    console.log(`  ✓ Got data for ${Object.keys(aggregates).length} messages\n`);
    return aggregates;
    
  } catch (error) {
    console.error(`  └─ Error:`, error.message);
    return {};
  }
}

/**
 * Get all sent EMAIL campaigns
 */
async function getAllCampaigns() {
  try {
    console.log('Fetching sent email campaigns...');
    
    const url = `${KLAVIYO_API_URL}/campaigns/?filter=equals(messages.channel,'email'),equals(status,'Sent')&include=campaign-messages`;
    
    const response = await fetchWithRetry(url, {
      method: 'GET',
      headers: {
        'Authorization': `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
        'revision': API_REVISION,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Campaigns API Error ${response.status}:`, errorText);
      return [];
    }

    let allCampaigns = [];
    let currentData = await response.json();
    
    allCampaigns = allCampaigns.concat(currentData.data || []);
    console.log(`Retrieved ${currentData.data?.length || 0} campaigns from first page`);
    
    // Follow pagination
    let nextUrl = currentData.links?.next;
    let pageCount = 1;
    
    while (nextUrl && pageCount < 10) {
      console.log(`Fetching page ${pageCount + 1}...`);
      await delay(300);
      
      const nextResponse = await fetchWithRetry(nextUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
          'revision': API_REVISION,
          'Accept': 'application/json'
        }
      });
      
      if (nextResponse.ok) {
        const nextData = await nextResponse.json();
        allCampaigns = allCampaigns.concat(nextData.data || []);
        nextUrl = nextData.links?.next;
        pageCount++;
      } else {
        break;
      }
    }
    
    console.log(`\n✓ Total campaigns retrieved: ${allCampaigns.length}\n`);
    
    // Map campaigns with their message IDs and send times
    const campaignsWithMessages = allCampaigns.map(campaign => {
      const messageRel = campaign.relationships?.['campaign-messages']?.data?.[0];
      const messageId = messageRel?.id;
      
      return {
        id: campaign.id,
        messageId: messageId,
        name: campaign.attributes?.name,
        sendTime: campaign.attributes?.send_time
      };
    }).filter(c => c.messageId);
    
    // Sort by most recent
    campaignsWithMessages.sort((a, b) => {
      const dateA = new Date(a.sendTime || 0);
      const dateB = new Date(b.sendTime || 0);
      return dateB - dateA;
    });
    
    return campaignsWithMessages;
    
  } catch (error) {
    console.error('Error fetching campaigns:', error.message);
    return [];
  }
}

/**
 * Aggregate metrics - LAST 30 DAYS as per Klaviyo standard
 */
async function aggregateAllMetrics(campaigns, metrics) {
  // Last 30 days (Klaviyo's standard)
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  
  const startDateStr = startDate.toISOString();
  const endDateStr = endDate.toISOString();
  
  console.log(`Date range: ${startDateStr.split('T')[0]} to ${endDateStr.split('T')[0]} (Last 30 Days)`);
  console.log('Per Klaviyo standard: Deliverability scores use last 30 days of data\n');
  console.log('='.repeat(70));
  console.log('FETCHING METRICS (Sequential with rate limit handling)');
  console.log('='.repeat(70) + '\n');
  
  // Fetch metrics sequentially to avoid rate limits
  const receivedData = await getMetricAggregates(metrics.received, 'Received Email', startDateStr, endDateStr);
  await delay(1200);
  
  const openedData = await getMetricAggregates(metrics.opened, 'Opened Email', startDateStr, endDateStr);
  await delay(1200);
  
  const clickedData = await getMetricAggregates(metrics.clicked, 'Clicked Email', startDateStr, endDateStr);
  await delay(1200);
  
  const bouncedData = await getMetricAggregates(metrics.bounced, 'Bounced Email', startDateStr, endDateStr);
  await delay(1200);
  
  const unsubscribedData = await getMetricAggregates(metrics.unsubscribed, 'Unsubscribed', startDateStr, endDateStr);
  await delay(1200);
  
  const spamData = await getMetricAggregates(metrics.spam, 'Marked as Spam', startDateStr, endDateStr);
  
  // Aggregate across all campaigns
  const totals = {
    sends: 0,
    delivered: 0,
    opens: 0,
    uniqueOpens: 0,
    clicks: 0,
    uniqueClicks: 0,
    bounces: 0,
    unsubscribes: 0,
    spamComplaints: 0,
    campaignsWithData: 0
  };
  
  console.log('\n' + '='.repeat(70));
  console.log('AGGREGATING CAMPAIGN DATA');
  console.log('='.repeat(70) + '\n');
  
  // Filter campaigns to last 30 days
  const thirtyDaysAgo = startDate.getTime();
  const recentCampaigns = campaigns.filter(c => {
    const sendTime = new Date(c.sendTime).getTime();
    return sendTime >= thirtyDaysAgo;
  });
  
  console.log(`Campaigns in last 30 days: ${recentCampaigns.length}\n`);
  
  let campaignsProcessed = 0;
  
  recentCampaigns.forEach(campaign => {
    const msgId = campaign.messageId;
    
    const received = receivedData[msgId]?.count || 0;
    const uniqueReceived = receivedData[msgId]?.unique || 0;
    const opened = openedData[msgId]?.count || 0;
    const uniqueOpened = openedData[msgId]?.unique || 0;
    const clicked = clickedData[msgId]?.count || 0;
    const uniqueClicked = clickedData[msgId]?.unique || 0;
    const bounced = bouncedData[msgId]?.count || 0;
    const unsubscribed = unsubscribedData[msgId]?.count || 0;
    const spam = spamData[msgId]?.count || 0;
    
    // DEBUG: Log first few campaigns to see what data we're getting
    if (campaignsProcessed < 5) {
      console.log(`\n[DEBUG] Campaign: ${campaign.name.substring(0, 40)}`);
      console.log(`  Message ID: ${msgId}`);
      console.log(`  Received: ${received}, Opens: ${opened}/${uniqueOpened}, Clicks: ${clicked}/${uniqueClicked}`);
      console.log(`  Has received data: ${!!receivedData[msgId]}`);
      console.log(`  Has opened data: ${!!openedData[msgId]}`);
      console.log(`  Has clicked data: ${!!clickedData[msgId]}`);
    }
    
    // Campaign has data if ANY metric has data
    // Some campaigns might have opens/clicks tracked but not "received"
    const hasData = received > 0 || uniqueOpened > 0 || uniqueClicked > 0 || 
                    opened > 0 || clicked > 0 || bounced > 0;
    
    if (hasData) {
      // Use received if available, otherwise estimate from opens
      const estimatedSends = received > 0 ? received : Math.max(uniqueOpened, opened, 1);
      
      totals.sends += estimatedSends;
      totals.delivered += Math.max(0, estimatedSends - bounced);
      totals.opens += opened;
      totals.uniqueOpens += uniqueOpened;
      totals.clicks += clicked;
      totals.uniqueClicks += uniqueClicked;
      totals.bounces += bounced;
      totals.unsubscribes += unsubscribed;
      totals.spamComplaints += spam;
      totals.campaignsWithData++;
      
      if (campaignsProcessed < 15) {
        const sendDate = new Date(campaign.sendTime).toLocaleDateString();
        console.log(`\n[${totals.campaignsWithData}] ${campaign.name.substring(0, 50)} (${sendDate})`);
        console.log(`    Sent: ${estimatedSends.toLocaleString()}, Opens: ${uniqueOpened.toLocaleString()}, Clicks: ${uniqueClicked.toLocaleString()}`);
      }
      
      campaignsProcessed++;
    }
  });
  
  if (campaignsProcessed > 15) {
    console.log(`\n... and ${campaignsProcessed - 15} more campaigns`);
  }
  
  console.log(`\n✓ Successfully aggregated data from ${totals.campaignsWithData} campaigns`);
  console.log(`✓ Total emails sent in last 30 days: ${totals.sends.toLocaleString()}\n`);
  
  return totals;
}

/**
 * Calculate deliverability score - KLAVIYO METHODOLOGY
 */
function calculateDeliverabilityScore(totals) {
  // Klaviyo requires at least 1000 sends in 30 days
  if (totals.sends < 1000) {
    return {
      score: 0,
      status: '⚠️  Insufficient Data',
      rates: {
        deliveryRate: '0.00',
        openRate: '0.00',
        clickRate: '0.00',
        bounceRate: '0.00',
        unsubRate: '0.00',
        spamRate: '0.00'
      },
      totals,
      message: `Need at least 1,000 emails sent in last 30 days. Currently: ${totals.sends.toLocaleString()}`
    };
  }

  const sends = totals.sends;
  const delivered = totals.delivered || 1;
  
  const deliveryRate = (delivered / sends) * 100;
  const openRate = (totals.uniqueOpens / delivered) * 100;
  const clickRate = (totals.uniqueClicks / delivered) * 100;
  const bounceRate = (totals.bounces / sends) * 100;
  const unsubRate = (totals.unsubscribes / delivered) * 100;
  const spamRate = (totals.spamComplaints / delivered) * 100;

  let score = 100;
  let penalties = [];

  // Klaviyo's benchmarks and scoring
  
  // Delivery Rate (Should be >99%)
  if (deliveryRate < 95) {
    score -= 25;
    penalties.push('Critical delivery rate (<95%)');
  } else if (deliveryRate < 98) {
    score -= 15;
    penalties.push('Low delivery rate (<98%)');
  } else if (deliveryRate < 99) {
    score -= 5;
    penalties.push('Below optimal delivery rate (<99%)');
  }

  // Open Rate (Target: >33%)
  if (openRate < 15) {
    score -= 30;
    penalties.push('Very low open rate (<15%)');
  } else if (openRate < 25) {
    score -= 20;
    penalties.push('Low open rate (<25%)');
  } else if (openRate < 33) {
    score -= 10;
    penalties.push('Below benchmark open rate (<33%)');
  } else if (openRate >= 40) {
    score += 5; // Bonus for excellent performance
    penalties.push('✨ Excellent open rate (>40%)');
  }

  // Click Rate (Target: >1.2%)
  if (clickRate < 0.3) {
    score -= 25;
    penalties.push('Very low click rate (<0.3%)');
  } else if (clickRate < 0.8) {
    score -= 15;
    penalties.push('Low click rate (<0.8%)');
  } else if (clickRate < 1.2) {
    score -= 5;
    penalties.push('Below benchmark click rate (<1.2%)');
  } else if (clickRate >= 2) {
    score += 5; // Bonus
    penalties.push('✨ Excellent click rate (>2%)');
  }

  // Bounce Rate (Target: <1%)
  if (bounceRate > 5) {
    score -= 30;
    penalties.push('🚨 CRITICAL bounce rate (>5%)');
  } else if (bounceRate > 3) {
    score -= 20;
    penalties.push('High bounce rate (>3%)');
  } else if (bounceRate > 2) {
    score -= 15;
    penalties.push('Elevated bounce rate (>2%)');
  } else if (bounceRate > 1) {
    score -= 10;
    penalties.push('Above target bounce rate (>1%)');
  }

  // Unsubscribe Rate (Target: <0.3%)
  if (unsubRate > 1) {
    score -= 20;
    penalties.push('High unsubscribe rate (>1%)');
  } else if (unsubRate > 0.5) {
    score -= 15;
    penalties.push('Elevated unsubscribe rate (>0.5%)');
  } else if (unsubRate > 0.3) {
    score -= 8;
    penalties.push('Above target unsubscribe rate (>0.3%)');
  }

  // Spam Rate (Target: <0.01%, Critical: >0.1%)
  if (spamRate > 0.3) {
    score -= 35;
    penalties.push('🚨 CRITICAL: Spam rate >0.3% (Gmail may block)');
  } else if (spamRate > 0.1) {
    score -= 25;
    penalties.push('🚨 Dangerous spam rate (>0.1%)');
  } else if (spamRate > 0.05) {
    score -= 15;
    penalties.push('High spam rate (>0.05%)');
  } else if (spamRate > 0.01) {
    score -= 10;
    penalties.push('Above target spam rate (>0.01%)');
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    score,
    status: getScoreStatus(score),
    rates: {
      deliveryRate: deliveryRate.toFixed(2),
      openRate: openRate.toFixed(2),
      clickRate: clickRate.toFixed(2),
      bounceRate: bounceRate.toFixed(2),
      unsubRate: unsubRate.toFixed(4),
      spamRate: spamRate.toFixed(4)
    },
    totals,
    penalties
  };
}

function getScoreStatus(score) {
  if (score >= 90) return '🟢 Excellent (90-100)';
  if (score >= 75) return '🔵 Good (75-89)';
  if (score >= 60) return '🟡 Fair (60-74)';
  if (score >= 40) return '🟠 Poor (40-59)';
  return '🔴 Critical (<40)';
}

function getRecommendations(result) {
  const recommendations = [];
  
  const deliveryRate = parseFloat(result.rates.deliveryRate);
  const openRate = parseFloat(result.rates.openRate);
  const clickRate = parseFloat(result.rates.clickRate);
  const bounceRate = parseFloat(result.rates.bounceRate);
  const unsubRate = parseFloat(result.rates.unsubRate);
  const spamRate = parseFloat(result.rates.spamRate);
  
  // Critical issues first
  if (spamRate > 0.1) {
    recommendations.push('🚨 URGENT: Spam rate >0.1% - Gmail may block emails!');
    recommendations.push('   → Review content for spam triggers immediately');
    recommendations.push('   → Verify SPF, DKIM, DMARC authentication');
    recommendations.push('   → Use Google Postmaster Tools to monitor');
  }
  
  if (bounceRate > 3) {
    recommendations.push('🚨 URGENT: High bounce rate detected');
    recommendations.push('   → Remove hard bounces immediately');
    recommendations.push('   → Implement email verification');
    recommendations.push('   → Use double opt-in for new signups');
  }
  
  // Delivery issues
  if (deliveryRate < 99) {
    recommendations.push('📬 Improve list hygiene:');
    recommendations.push('   → Remove invalid/old email addresses');
    recommendations.push('   → Clean list regularly (every 3-6 months)');
    recommendations.push('   → Verify SPF, DKIM, DMARC records');
  }
  
  // Engagement issues
  if (openRate < 33) {
    recommendations.push('📧 Boost open rates:');
    recommendations.push('   → A/B test subject lines');
    recommendations.push('   → Optimize send times for your audience');
    recommendations.push('   → Improve sender name recognition');
    recommendations.push('   → Segment your audience better');
  }
  
  if (clickRate < 1.2) {
    recommendations.push('🔗 Improve click-through rates:');
    recommendations.push('   → Make CTAs more prominent and compelling');
    recommendations.push('   → Personalize email content');
    recommendations.push('   → Optimize for mobile (50%+ open on mobile)');
    recommendations.push('   → Test different email layouts');
  }
  
  if (unsubRate > 0.3) {
    recommendations.push('🎯 Reduce unsubscribes:');
    recommendations.push('   → Review email frequency (may be too high)');
    recommendations.push('   → Improve content relevance and quality');
    recommendations.push('   → Better audience segmentation');
    recommendations.push('   → Offer preference center instead of full unsub');
  }
  
  // Positive feedback
  if (recommendations.length === 0) {
    recommendations.push('✅ Excellent deliverability! Keep up the great work:');
    recommendations.push('   → Continue regular list cleaning');
    recommendations.push('   → Maintain consistent sending schedule');
    recommendations.push('   → Monitor metrics weekly');
  }
  
  return recommendations;
}

/**
 * Main execution
 */
async function getDeliverabilityScore() {
  console.log('='.repeat(70));
  console.log('KLAVIYO EMAIL DELIVERABILITY SCORE CALCULATOR');
  console.log('Based on Official Klaviyo Methodology (Last 30 Days)');
  console.log('='.repeat(70) + '\n');

  const connected = await testAPIConnection();
  if (!connected) {
    console.log('\n❌ Failed to connect to Klaviyo API');
    return;
  }

  const metrics = await getMetrics();
  if (!metrics || !metrics.received) {
    console.log('\n❌ Failed to fetch required metrics');
    return;
  }

  const campaigns = await getAllCampaigns();
  
  if (campaigns.length === 0) {
    console.log('⚠️  No sent email campaigns found');
    return;
  }

  const totals = await aggregateAllMetrics(campaigns, metrics);

  if (totals.campaignsWithData === 0) {
    console.log('\n⚠️  No campaign data found in the last 30 days');
    return;
  }

  const result = calculateDeliverabilityScore(totals);

  // Display results
  console.log('\n' + '='.repeat(70));
  console.log('📊 DELIVERABILITY SCORE RESULTS (Last 30 Days)');
  console.log('='.repeat(70));
  console.log(`\n🎯 OVERALL SCORE: ${result.score}/100 - ${result.status}\n`);
  
  if (result.message) {
    console.log(`ℹ️  ${result.message}\n`);
  }
  
  if (result.penalties && result.penalties.length > 0) {
    const issues = result.penalties.filter(p => !p.startsWith('✨'));
    const positives = result.penalties.filter(p => p.startsWith('✨'));
    
    if (issues.length > 0) {
      console.log('⚠️  Issues Affecting Score:');
      issues.forEach(p => console.log(`   • ${p}`));
      console.log('');
    }
    
    if (positives.length > 0) {
      console.log('✨ Excellent Performance:');
      positives.forEach(p => console.log(`   • ${p.replace('✨ ', '')}`));
      console.log('');
    }
  }
  
  console.log('📈 KEY METRICS (Klaviyo Benchmarks):\n');
  console.log(`  Delivery Rate:     ${result.rates.deliveryRate}%  ${parseFloat(result.rates.deliveryRate) >= 99 ? '✓ Good' : '✗ Needs Work'} (Target: ≥99%)`);
  console.log(`  Open Rate:         ${result.rates.openRate}%  ${parseFloat(result.rates.openRate) >= 33 ? '✓ Good' : '✗ Needs Work'} (Target: ≥33%)`);
  console.log(`  Click Rate:        ${result.rates.clickRate}%  ${parseFloat(result.rates.clickRate) >= 1.2 ? '✓ Good' : '✗ Needs Work'} (Target: ≥1.2%)`);
  console.log(`  Bounce Rate:       ${result.rates.bounceRate}%  ${parseFloat(result.rates.bounceRate) <= 1 ? '✓ Good' : '✗ Needs Work'} (Target: ≤1%)`);
  console.log(`  Unsubscribe Rate:  ${result.rates.unsubRate}%  ${parseFloat(result.rates.unsubRate) <= 0.3 ? '✓ Good' : '✗ Needs Work'} (Target: ≤0.3%)`);
  console.log(`  Spam Rate:         ${result.rates.spamRate}%  ${parseFloat(result.rates.spamRate) <= 0.01 ? '✓ Good' : parseFloat(result.rates.spamRate) > 0.1 ? '🚨 CRITICAL' : '✗ Needs Work'} (Target: ≤0.01%)`);
  
  console.log('\n📧 CAMPAIGN SUMMARY:\n');
  console.log(`  Time Period:        Last 30 days`);
  console.log(`  Campaigns Analyzed: ${totals.campaignsWithData}`);
  console.log(`  Total Sent:         ${result.totals.sends.toLocaleString()}`);
  console.log(`  Delivered:          ${result.totals.delivered.toLocaleString()}`);
  console.log(`  Unique Opens:       ${result.totals.uniqueOpens.toLocaleString()}`);
  console.log(`  Total Opens:        ${result.totals.opens.toLocaleString()}`);
  console.log(`  Unique Clicks:      ${result.totals.uniqueClicks.toLocaleString()}`);
  console.log(`  Total Clicks:       ${result.totals.clicks.toLocaleString()}`);
  console.log(`  Bounces:            ${result.totals.bounces.toLocaleString()}`);
  console.log(`  Unsubscribes:       ${result.totals.unsubscribes.toLocaleString()}`);
  console.log(`  Spam Complaints:    ${result.totals.spamComplaints.toLocaleString()}`);
  
  const recommendations = getRecommendations(result);
  if (recommendations.length > 0) {
    console.log('\n💡 ACTIONABLE RECOMMENDATIONS:\n');
    recommendations.forEach(rec => console.log(`  ${rec}`));
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('📚 Based on Official Klaviyo Documentation:');
  console.log('   • Scores calculated using last 30 days of data');
  console.log('   • Minimum 1,000 sends required for accurate scoring');
  console.log('   • Benchmarks based on industry standards');
  console.log('='.repeat(70) + '\n');

  return result;
}

// Run the script
getDeliverabilityScore().catch(error => {
  console.error('\n❌ Fatal Error:', error.message);
  console.error(error.stack);
});