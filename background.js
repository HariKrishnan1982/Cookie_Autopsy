// background.js
// Service Worker — runs in the background, reads cookies, talks to popup

import { classifyCookie } from './lib/classifier.js';
import { calculateRisk, getRiskSummary } from './lib/risk-scorer.js';

// Store cookie activity per tab
const tabCookieLog = new Map();

// ============================================
// 1. LISTEN FOR COOKIE CHANGES (REAL-TIME)
// ============================================
chrome.cookies.onChanged.addListener(async (changeInfo) => {
  const { cookie, removed, cause } = changeInfo;
  
  // Skip if we caused the removal ourselves (avoid loops)
  if (cause === 'explicit' && removed) return;
  
  // Classify and score the cookie
  const classification = classifyCookie(cookie);
  const riskScore = calculateRisk(cookie, classification);
  
  // Log it
  const domainKey = cookie.domain.startsWith('.') 
    ? cookie.domain.slice(1) 
    : cookie.domain;
  
  if (!tabCookieLog.has(domainKey)) {
    tabCookieLog.set(domainKey, []);
  }
  
  tabCookieLog.get(domainKey).push({
    timestamp: Date.now(),
    action: removed ? 'removed' : 'set',
    name: cookie.name,
    classification,
    riskScore,
    cause
  });
  
  // Update badge with high-risk count
  updateBadge();
  
  // Show toast notification if it's a new high-risk tracker
  if (!removed && riskScore.level === 'high' && classification.category === 'tracking') {
    notifyContentScript(cookie.domain, classification, riskScore, removed);
  }
});

// ============================================
// 2. HANDLE MESSAGES FROM POPUP
// ============================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  if (request.action === 'getCookiesForTab') {
    getCookiesForActiveTab().then(sendResponse);
    return true; // async response
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

// ============================================
// 3. GET ALL COOKIES FOR CURRENT TAB
// ============================================
async function getCookiesForActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return [];
  
  const url = new URL(tab.url);
  const domain = url.hostname;
  
  // Get all cookies that apply to this domain
  const cookies = await chrome.cookies.getAll({ domain });
  
  // Also get cookies for parent domains (e.g., example.com for www.example.com)
  const parentDomain = domain.replace(/^www\./, '');
  if (parentDomain !== domain) {
    const parentCookies = await chrome.cookies.getAll({ domain: parentDomain });
    cookies.push(...parentCookies);
  }
  
  // Deduplicate by name+domain
  const seen = new Set();
  const unique = [];
  
  for (const cookie of cookies) {
    const key = `${cookie.name}@${cookie.domain}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(cookie);
    }
  }
  
  // Enrich each cookie with classification and risk
  return unique.map(cookie => {
    const classification = classifyCookie(cookie);
    const riskScore = calculateRisk(cookie, classification);
    
    return {
      ...cookie,
      classification,
      riskScore,
      humanExpiry: cookie.expirationDate 
        ? new Date(cookie.expirationDate * 1000).toLocaleDateString()
        : 'Session (deleted when browser closes)',
      isThirdParty: !cookie.hostOnly
    };
  }).sort((a, b) => b.riskScore.score - a.riskScore.score); // High risk first
}

// ============================================
// 4. UPDATE BADGE WITH HIGH-RISK COUNT
// ============================================
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
    
    chrome.action.setBadgeText({
      text: highRiskCount > 0 ? String(highRiskCount) : '',
      tabId: tab.id
    });
    
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
  } catch (e) {
    // Ignore errors for special URLs (chrome://, etc.)
  }
}

// ============================================
// 5. NOTIFY CONTENT SCRIPT (TOAST)
// ============================================
function notifyContentScript(domain, classification, risk, removed) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.url && tab.url.includes(domain.replace(/^\./, ''))) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'cookieEvent',
          classification,
          risk,
          removed,
          domain
        }).catch(() => {}); // Tab might not have content script
      }
    });
  });
}

// ============================================
// 6. BLOCK COOKIES BY CATEGORY
// ============================================
async function blockCookiesByCategory(category) {
  const allCookies = await chrome.cookies.getAll({});
  const toBlock = [];
  
  for (const cookie of allCookies) {
    const classification = classifyCookie(cookie);
    if (classification.category === category) {
      toBlock.push(cookie);
    }
  }
  
  // Remove them
  let removed = 0;
  for (const cookie of toBlock) {
    try {
      const url = `http${cookie.secure ? 's' : ''}://${cookie.domain.replace(/^\./, '')}${cookie.path}`;
      await chrome.cookies.remove({ url, name: cookie.name });
      removed++;
    } catch (e) {
      // Some cookies can't be removed (e.g., httpOnly on different domain)
    }
  }
  
  // Add DNR rule to prevent future ones
  const domains = [...new Set(toBlock.map(c => c.domain.replace(/^\./, '')))];
  if (domains.length > 0) {
    const ruleId = Date.now();
    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: [{
        id: ruleId,
        priority: 1,
        action: { type: 'block' },
        condition: {
          requestDomains: domains,
          resourceTypes: ['script', 'xmlhttprequest', 'sub_frame']
        }
      }],
      removeRuleIds: []
    });
  }
  
  return { blocked: removed, domains };
}

// ============================================
// 7. GENERATE EXPORT REPORT
// ============================================
async function generateExport(format = 'json') {
  const allCookies = await chrome.cookies.getAll({});
  const report = {
    generatedAt: new Date().toISOString(),
    totalCookies: allCookies.length,
    summary: {
      essential: 0,
      analytics: 0,
      advertising: 0,
      tracking: 0,
      unknown: 0
    },
    highRiskDomains: [],
    cookies: []
  };
  
  for (const cookie of allCookies) {
    const classification = classifyCookie(cookie);
    const risk = calculateRisk(cookie, classification);
    
    report.summary[classification.category] = (report.summary[classification.category] || 0) + 1;
    
    if (risk.level === 'high') {
      report.highRiskDomains.push(cookie.domain);
    }
    
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

// ============================================
// 8. GLOBAL STATS
// ============================================
async function getGlobalStats() {
  const allCookies = await chrome.cookies.getAll({});
  const stats = {
    total: allCookies.length,
    byCategory: {},
    byRiskLevel: { high: 0, medium: 0, low: 0 },
    byCompany: {},
    thirdParty: 0
  };
  
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

// ============================================
// 9. UPDATE BADGE WHEN TAB CHANGES
// ============================================
chrome.tabs.onActivated.addListener(updateBadge);
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') updateBadge();
});