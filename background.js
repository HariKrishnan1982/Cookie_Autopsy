// background.js
// Service Worker — runs in the background, reads cookies, talks to popup
// ALL-IN-ONE VERSION (no imports needed for Chrome testing)

// ============================================
// COOKIE SIGNATURE DATABASE (inlined)
// ============================================
const SIGNATURES = {
  "version": "1.0.0",
  "signatures": [
    {
      "patterns": ["_ga", "_gid", "_gat"],
      "company": "Google",
      "product": "Google Analytics",
      "category": "analytics",
      "risk": "medium",
      "description": "Tracks which pages you visit to measure site traffic",
      "crossSite": true,
      "dataCollected": ["pages_visited", "session_duration"]
    },
    {
      "patterns": ["NID", "1P_JAR", "CONSENT"],
      "company": "Google",
      "product": "Google Ads",
      "category": "advertising",
      "risk": "high",
      "description": "Builds a profile of your interests for targeted ads",
      "crossSite": true,
      "dataCollected": ["search_history", "ad_clicks", "interests"]
    },
    {
      "patterns": ["fr", "_fbp", "datr"],
      "company": "Meta (Facebook)",
      "product": "Facebook Pixel",
      "category": "tracking",
      "risk": "high",
      "description": "Follows you across websites to show you Facebook/Instagram ads",
      "crossSite": true,
      "dataCollected": ["pages_visited", "products_viewed", "purchases"]
    },
    {
      "patterns": ["__cf_bm"],
      "company": "Cloudflare",
      "product": "Bot Management",
      "category": "essential",
      "risk": "low",
      "description": "Makes sure you're a real human, not a bot",
      "crossSite": false,
      "dataCollected": ["browser_fingerprint"]
    },
    {
      "patterns": ["__stripe_sid", "__stripe_mid"],
      "company": "Stripe",
      "product": "Payment Processing",
      "category": "essential",
      "risk": "low",
      "description": "Prevents fraud during payment processing",
      "crossSite": false,
      "dataCollected": ["session_id"]
    },
    {
      "patterns": ["_hjid", "_hjSession"],
      "company": "Hotjar",
      "product": "User Behavior Analytics",
      "category": "analytics",
      "risk": "medium",
      "description": "Records mouse movements and clicks for heatmaps",
      "crossSite": false,
      "dataCollected": ["mouse_movements", "clicks", "scroll_depth"]
    },
    {
      "patterns": ["ttwid", "_ttp"],
      "company": "TikTok",
      "product": "TikTok Pixel",
      "category": "tracking",
      "risk": "high",
      "description": "Tracks your activity across sites for TikTok ads",
      "crossSite": true,
      "dataCollected": ["pages_visited", "video_engagement", "purchases"]
    },
    {
      "patterns": ["MUID"],
      "company": "Microsoft",
      "product": "Bing Ads",
      "category": "advertising",
      "risk": "high",
      "description": "Links your behavior across Microsoft sites for ad targeting",
      "crossSite": true,
      "dataCollected": ["search_history", "pages_visited", "ad_interactions"]
    },
    {
      "patterns": ["session", "sess", "sessionid"],
      "company": "Website",
      "product": "Session Management",
      "category": "essential",
      "risk": "low",
      "description": "Keeps you logged in while you browse",
      "crossSite": false,
      "dataCollected": ["session_token"]
    },
    {
      "patterns": ["csrf", "csrftoken", "_csrf"],
      "company": "Website",
      "product": "Security Token",
      "category": "essential",
      "risk": "low",
      "description": "Protects you from fake form submissions",
      "crossSite": false,
      "dataCollected": ["security_token"]
    },
    {
      "patterns": ["cart", "basket", "shopping_cart"],
      "company": "Website",
      "product": "Shopping Cart",
      "category": "essential",
      "risk": "low",
      "description": "Remembers what you put in your shopping cart",
      "crossSite": false,
      "dataCollected": ["cart_items"]
    },
    {
      "patterns": ["pref", "preferences", "settings", "theme", "lang"],
      "company": "Website",
      "product": "User Preferences",
      "category": "essential",
      "risk": "low",
      "description": "Remembers your settings like dark mode or language",
      "crossSite": false,
      "dataCollected": ["user_preferences"]
    }
  ]
};

// ============================================
// CLASSIFIER (inlined — no import needed)
// ============================================
function classifyCookie(cookie) {
  const { name, value, domain } = cookie;
  
  // 1. Exact match against signatures
  for (const sig of SIGNATURES.signatures) {
    for (const pattern of sig.patterns) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      if (regex.test(name)) {
        return {
          company: sig.company,
          product: sig.product,
          category: sig.category,
          risk: sig.risk,
          description: sig.description,
          crossSite: sig.crossSite,
          dataCollected: sig.dataCollected || [],
          confidence: 1.0,
          matchType: 'exact'
        };
      }
    }
  }
  
  // 2. Domain-based inference
  const domainMap = {
    'google-analytics.com': { company: 'Google', product: 'Analytics', category: 'analytics', risk: 'medium' },
    'doubleclick.net': { company: 'Google', product: 'Ad Exchange', category: 'advertising', risk: 'high' },
    'facebook.com': { company: 'Meta', product: 'Facebook Connect', category: 'tracking', risk: 'high' },
    'connect.facebook.net': { company: 'Meta', product: 'Facebook Pixel', category: 'tracking', risk: 'high' },
    'analytics.twitter.com': { company: 'Twitter/X', product: 'Conversion Tracking', category: 'tracking', risk: 'high' },
    'bat.bing.com': { company: 'Microsoft', product: 'Bing Ads', category: 'advertising', risk: 'high' },
    'analytics.tiktok.com': { company: 'TikTok', product: 'Pixel', category: 'tracking', risk: 'high' }
  };
  
  for (const [trackerDomain, info] of Object.entries(domainMap)) {
    if (domain.includes(trackerDomain)) {
      return {
        ...info,
        description: `Cookie from ${info.company}'s ${info.product} service`,
        crossSite: true,
        dataCollected: ['pages_visited', 'interactions'],
        confidence: 0.7,
        matchType: 'domain'
      };
    }
  }
  
  // 3. Heuristics
  const lowerName = name.toLowerCase();
  if (lowerName.includes('session') || lowerName.includes('sess')) {
    return { company: 'Unknown', product: 'Unknown', category: 'essential', risk: 'low', description: 'Likely keeps you logged in', crossSite: false, dataCollected: ['session_token'], confidence: 0.6, matchType: 'heuristic' };
  }
  if (lowerName.includes('cart') || lowerName.includes('basket')) {
    return { company: 'Unknown', product: 'Unknown', category: 'essential', risk: 'low', description: 'Likely remembers shopping cart items', crossSite: false, dataCollected: ['cart_items'], confidence: 0.8, matchType: 'heuristic' };
  }
  if (lowerName.includes('pref') || lowerName.includes('settings') || lowerName.includes('theme') || lowerName.includes('lang')) {
    return { company: 'Unknown', product: 'Unknown', category: 'essential', risk: 'low', description: 'Likely stores your preferences', crossSite: false, dataCollected: ['user_preferences'], confidence: 0.7, matchType: 'heuristic' };
  }
  if (lowerName.includes('csrf') || lowerName.includes('xsrf')) {
    return { company: 'Unknown', product: 'Unknown', category: 'essential', risk: 'low', description: 'Likely protects from fake form submissions', crossSite: false, dataCollected: ['security_token'], confidence: 0.7, matchType: 'heuristic' };
  }
  if (lowerName.includes('consent') || lowerName.includes('cookie') || lowerName.includes('gdpr')) {
    return { company: 'Unknown', product: 'Unknown', category: 'essential', risk: 'low', description: 'Likely remembers your cookie consent choice', crossSite: false, dataCollected: ['consent_preferences'], confidence: 0.8, matchType: 'heuristic' };
  }
  
  return {
    company: 'Unknown',
    product: 'Unknown',
    category: 'unknown',
    risk: 'unknown',
    description: 'No info available — not in our database',
    crossSite: null,
    dataCollected: [],
    confidence: 0,
    matchType: 'unknown'
  };
}

// ============================================
// RISK SCORER (inlined — no import needed)
// ============================================
function calculateRisk(cookie, classification) {
  let score = 0;
  const reasons = [];
  
  if (!cookie.hostOnly) {
    score += 30;
    reasons.push('Third-party cookie — follows you across sites');
  }
  
  if (cookie.expirationDate) {
    const days = (cookie.expirationDate - Date.now() / 1000) / 86400;
    if (days > 365 * 2) { score += 25; reasons.push('Expires in 2+ years — long-term tracking'); }
    else if (days > 365) { score += 15; reasons.push('Expires in >1 year'); }
    else if (days > 30) { score += 5; reasons.push('Expires in >30 days'); }
  } else {
    reasons.push('Session cookie — deleted when browser closes');
  }
  
  if (!cookie.secure) { score += 15; reasons.push('Not Secure — can be stolen on HTTP'); }
  if (!cookie.httpOnly) { score += 10; reasons.push('Not HttpOnly — JavaScript can read it'); }
  if (cookie.sameSite === 'no_restriction') { score += 20; reasons.push('SameSite=None — maximum cross-site tracking'); }
  else if (cookie.sameSite === 'unspecified') { score += 5; reasons.push('SameSite not set'); }
  
  if (classification.category === 'tracking') { score += 25; reasons.push('Known cross-site tracker'); }
  else if (classification.category === 'advertising') { score += 20; reasons.push('Used for ad targeting'); }
  else if (classification.category === 'analytics') { score += 5; reasons.push('Analytics tracking'); }
  
  if (classification.dataCollected) {
    const sensitive = ['location', 'purchases', 'login_status', 'search_history', 'session_recordings'];
    if (classification.dataCollected.some(d => sensitive.includes(d))) {
      score += 10; reasons.push('Collects sensitive personal data');
    }
  }
  
  if (classification.crossSite === true) { score += 10; reasons.push('Works across multiple websites'); }
  
  score = Math.min(100, Math.max(0, score));
  
  let level;
  if (score >= 60) level = 'high';
  else if (score >= 30) level = 'medium';
  else level = 'low';
  
  return { score, level, reasons, emoji: level === 'high' ? '🔴' : level === 'medium' ? '🟡' : '🟢' };
}

// ============================================
// BACKGROUND LOGIC
// ============================================
const tabCookieLog = new Map();

chrome.cookies.onChanged.addListener(async (changeInfo) => {
  const { cookie, removed, cause } = changeInfo;
  if (cause === 'explicit' && removed) return;
  
  const classification = classifyCookie(cookie);
  const riskScore = calculateRisk(cookie, classification);
  
  const domainKey = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
  if (!tabCookieLog.has(domainKey)) tabCookieLog.set(domainKey, []);
  
  tabCookieLog.get(domainKey).push({
    timestamp: Date.now(),
    action: removed ? 'removed' : 'set',
    name: cookie.name,
    classification,
    riskScore,
    cause
  });
  
  updateBadge();
  
  if (!removed && riskScore.level === 'high' && classification.category === 'tracking') {
    notifyContentScript(cookie.domain, classification, riskScore, removed);
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getCookiesForTab') {
    getCookiesForActiveTab().then(sendResponse);
    return true;
  }
  if (request.action === 'blockByCategory') {
    blockCookiesByCategory(request.category).then(sendResponse);
    return true;
  }
  if (request.action === 'exportReport') {
    generateExport(request.format).then(sendResponse);
    return true;
  }
  if (request.action === 'getStats') {
    getGlobalStats().then(sendResponse);
    return true;
  }
});

async function getCookiesForActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return [];
  
  const url = new URL(tab.url);
  const domain = url.hostname;
  
  const cookies = await chrome.cookies.getAll({ domain });
  const parentDomain = domain.replace(/^www\./, '');
  if (parentDomain !== domain) {
    const parentCookies = await chrome.cookies.getAll({ domain: parentDomain });
    cookies.push(...parentCookies);
  }
  
  const seen = new Set();
  const unique = [];
  for (const cookie of cookies) {
    const key = `${cookie.name}@${cookie.domain}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(cookie);
    }
  }
  
  return unique.map(cookie => {
    const classification = classifyCookie(cookie);
    const riskScore = calculateRisk(cookie, classification);
    return {
      ...cookie,
      classification,
      riskScore,
      humanExpiry: cookie.expirationDate ? new Date(cookie.expirationDate * 1000).toLocaleDateString() : 'Session (deleted when browser closes)',
      isThirdParty: !cookie.hostOnly
    };
  }).sort((a, b) => b.riskScore.score - a.riskScore.score);
}

async function updateBadge() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return;
  
  try {
    const url = new URL(tab.url);
    const cookies = await chrome.cookies.getAll({ domain: url.hostname });
    let highRiskCount = 0;
    for (const cookie of cookies) {
      const classification = classifyCookie(cookie);
      const risk = calculateRisk(cookie, classification);
      if (risk.level === 'high') highRiskCount++;
    }
    chrome.action.setBadgeText({ text: highRiskCount > 0 ? String(highRiskCount) : '', tabId: tab.id });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
  } catch (e) {}
}

function notifyContentScript(domain, classification, risk, removed) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.url && tab.url.includes(domain.replace(/^\./, ''))) {
        chrome.tabs.sendMessage(tab.id, { type: 'cookieEvent', classification, risk, removed, domain }).catch(() => {});
      }
    });
  });
}

async function blockCookiesByCategory(category) {
  const allCookies = await chrome.cookies.getAll({});
  const toBlock = [];
  for (const cookie of allCookies) {
    const classification = classifyCookie(cookie);
    if (classification.category === category) toBlock.push(cookie);
  }
  
  let removed = 0;
  for (const cookie of toBlock) {
    try {
      const url = `http${cookie.secure ? 's' : ''}://${cookie.domain.replace(/^\./, '')}${cookie.path}`;
      await chrome.cookies.remove({ url, name: cookie.name });
      removed++;
    } catch (e) {}
  }
  
  const domains = [...new Set(toBlock.map(c => c.domain.replace(/^\./, '')))];
  if (domains.length > 0) {
    const ruleId = Date.now();
    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: [{
        id: ruleId,
        priority: 1,
        action: { type: 'block' },
        condition: { requestDomains: domains, resourceTypes: ['script', 'xmlhttprequest', 'sub_frame'] }
      }],
      removeRuleIds: []
    });
  }
  
  return { blocked: removed, domains };
}

async function generateExport(format = 'json') {
  const allCookies = await chrome.cookies.getAll({});
  const report = {
    generatedAt: new Date().toISOString(),
    totalCookies: allCookies.length,
    summary: { essential: 0, analytics: 0, advertising: 0, tracking: 0, unknown: 0 },
    highRiskDomains: [],
    cookies: []
  };
  
  for (const cookie of allCookies) {
    const classification = classifyCookie(cookie);
    const risk = calculateRisk(cookie, classification);
    report.summary[classification.category] = (report.summary[classification.category] || 0) + 1;
    if (risk.level === 'high') report.highRiskDomains.push(cookie.domain);
    report.cookies.push({
      name: cookie.name,
      domain: cookie.domain,
      path: cookie.path,
      category: classification.category,
      company: classification.company,
      product: classification.product,
      riskScore: risk.score,
      riskLevel: risk.level,
      description: classification.description,
      dataCollected: classification.dataCollected || [],
      security: {
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite,
        expirationDate: cookie.expirationDate ? new Date(cookie.expirationDate * 1000).toISOString() : 'session'
      }
    });
  }
  
  report.highRiskDomains = [...new Set(report.highRiskDomains)].sort();
  return report;
}

async function getGlobalStats() {
  const allCookies = await chrome.cookies.getAll({});
  const stats = { total: allCookies.length, byCategory: {}, byRiskLevel: { high: 0, medium: 0, low: 0 }, byCompany: {}, thirdParty: 0 };
  for (const cookie of allCookies) {
    const classification = classifyCookie(cookie);
    const risk = calculateRisk(cookie, classification);
    stats.byCategory[classification.category] = (stats.byCategory[classification.category] || 0) + 1;
    stats.byRiskLevel[risk.level]++;
    stats.byCompany[classification.company] = (stats.byCompany[classification.company] || 0) + 1;
    if (!cookie.hostOnly) stats.thirdParty++;
  }
  return stats;
}

chrome.tabs.onActivated.addListener(updateBadge);
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') updateBadge();
});