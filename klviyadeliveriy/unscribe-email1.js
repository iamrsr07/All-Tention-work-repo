// Klaviyo Unsubscribe Rate Calculator - Using Reporting API (matches dashboard!)
const KLAVIYO_API_KEY = 'pk_5656f025641fe415c1309909a1adae8120';
const API_BASE_URL = 'https://a.klaviyo.com/api';

async function getMetrics() {
  const url = `${API_BASE_URL}/metrics/`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
      'revision': '2024-10-15'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch metrics: ${response.status}`);
  }

  return await response . json();
}

async function getCampaignReport(conversionMetricId) {
  const url = `${API_BASE_URL}/campaign-values-reports/`;
  
  const body = {
    data: {
      type: 'campaign-values-report',
      attributes: {
        statistics: ['recipients', 'unsubscribes', 'unsubscribe_rate'],
        timeframe: {
          key: 'last_30_days'
        },
        conversion_metric_id: conversionMetricId
      }
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
      'revision': '2024-10-15',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Campaign API Error:`, errorText);
    return null;
  }

  return await response.json();
}

async function getFlowReport(conversionMetricId) {
  const url = `${API_BASE_URL}/flow-values-reports/`;
  
  const body = {
    data: {
      type: 'flow-values-report',
      attributes: {
        statistics: ['recipients', 'unsubscribes', 'unsubscribe_rate'],
        timeframe: {
          key: 'last_30_days'
        },
        conversion_metric_id: conversionMetricId
      }
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
      'revision': '2024-10-15',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Flow API Error:`, errorText);
    return null;
  }

  return await response.json();
}

async function calculateUnsubscribeRate() {
  try {
    console.log('=== Klaviyo Unsubscribe Rate Calculator ===\n');
    console.log('Using Reporting API (matches dashboard data)\n');
    console.log('Timeframe: Last 30 days\n');
    
    // Step 1: Get conversion metric ID (required by API)
    console.log('Step 1: Finding conversion metric...');
    const metricsData = await getMetrics();
    
    // Look for "Placed Order" metric (most common conversion metric)
    const placedOrderMetric = metricsData.data.find(m => 
      m.attributes.name === 'Placed Order'
    );
    
    if (!placedOrderMetric) {
      console.error('Could not find "Placed Order" metric. This is required for the Reporting API.');
      console.log('\nAvailable metrics:');
      metricsData.data.forEach(m => console.log(`- ${m.attributes.name}`));
      return;
    }
    
    console.log(`✓ Using conversion metric: ${placedOrderMetric.attributes.name} (${placedOrderMetric.id})\n`);
    
    // Step 2: Get campaign data
    console.log('Step 2: Fetching campaign data...');
    const campaignData = await getCampaignReport(placedOrderMetric.id);
    
    // Step 3: Get flow data
    console.log('Step 3: Fetching flow data...');
    const flowData = await getFlowReport(placedOrderMetric.id);
    
    let totalRecipients = 0;
    let totalUnsubscribes = 0;
    
    // Aggregate campaign data
    if (campaignData && campaignData.data && campaignData.data.attributes) {
      const results = campaignData.data.attributes.results || [];
      
      for (const result of results) {
        if (result.statistics) {
          totalRecipients += result.statistics.recipients || 0;
          totalUnsubscribes += result.statistics.unsubscribes || 0;
        }
      }
      
      console.log(`✓ Campaigns: ${results.length} campaign(s) processed`);
    }
    
    // Aggregate flow data
    if (flowData && flowData.data && flowData.data.attributes) {
      const results = flowData.data.attributes.results || [];
      
      for (const result of results) {
        if (result.statistics) {
          totalRecipients += result.statistics.recipients || 0;
          totalUnsubscribes += result.statistics.unsubscribes || 0;
        }
      }
      
      console.log(`✓ Flows: ${results.length} flow message(s) processed`);
    }
    
    // Calculate overall rate
    console.log('\n=== RESULTS ===');
    console.log(`Total Emails Sent: ${totalRecipients.toLocaleString()}`);
    console.log(`Total Unsubscribes: ${totalUnsubscribes.toLocaleString()}`);
    
    if (totalRecipients > 0) {
      const unsubRate = ((totalUnsubscribes / totalRecipients) * 100).toFixed(2);
      console.log(`\n📊 Unsubscribe Rate: ${unsubRate}%`);
      
      // Benchmark comparison
      const rate = parseFloat(unsubRate);
      if (rate < 0.30) {
        console.log('✅ EXCELLENT - Below 0.30% industry benchmark');
      } else if (rate < 0.50) {
        console.log('✓ GOOD - Within industry average');
      } else {
        console.log('⚠️  HIGH - Above industry average');
      }
    } else {
      console.log('\n⚠️  No emails sent in this time period');
    }
    
    console.log('===============\n');

  } catch (error) {
    console.error('Error:', error.message);
  }
}

calculateUnsubscribeRate();