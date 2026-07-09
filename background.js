// background.js - Professional Modular Architecture v1.1
import { getSignatures } from './lib/signature-manager.js';
import { classifyCookie } from './lib/classifier.js';
import { calculateRisk } from './lib/risk-scorer.js';
import { detectSyncGroups } from './lib/sync-detector.js';

// Global signature cache
let currentSignatures = null;

// Initialize on startup
(async () => {
  try {
    currentSignatures = await getSignatures();
    console.log(`[Cookie Autopsy] Loaded ${currentSignatures.signatures?.length || 0} signatures`);
  } catch (e) {
    console.error('[Cookie Autopsy] Failed to load signatures:', e);
    currentSignatures = { signatures: [], domainMappings: {} };
  }
})();

// ============================================
// CORE COOKIE FUNCTIONS
// ============================================

async function getCookiesForActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return [];

  // Ensure signatures are loaded
  if (!currentSignatures) currentSignatures = await getSignatures();

  const url = new URL(tab.url);
  const hostname = url.hostname;

  // Get cookies for exact hostname AND parent domains (fixes Wikimedia issue)
  let cookies = await chrome.cookies.getAll({ domain: hostname });

  const parts = hostname.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    const parentDomain = '.' + parts.slice(i).join('.');
    try {
      const parentCookies = await chrome.cookies.getAll({ domain: parentDomain });
      cookies = cookies.concat(parentCookies);
    } catch (e) { /* Skip inaccessible parent domains */ }
  }

  // Deduplicate
  const seen = new Set();
  const unique = [];
  for (const cookie of cookies) {
    const key = `${cookie.name}@${cookie.domain}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(cookie);
    }
  }

  // Classify and score each cookie
  return unique.map(cookie => {
    const classification = classifyCookie(cookie, currentSignatures);
    const riskScore = calculateRisk(cookie, classification);
    return {
      ...cookie,
      classification,
      riskScore,
      humanExpiry: cookie.expirationDate
        ? new Date(cookie.expirationDate * 1000).toLocaleDateString()
        : 'Session'
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

    if (!currentSignatures) currentSignatures = await getSignatures();

    for (const cookie of cookies) {
      const cls = classifyCookie(cookie, currentSignatures);
      const risk = calculateRisk(cookie, cls);
      if (risk.level === 'high') highRiskCount++;
    }

    chrome.action.setBadgeText({
      text: highRiskCount > 0 ? String(highRiskCount) : '',
      tabId: tab.id
    });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
  } catch (e) { /* Silent fail */ }
}

async function blockCookiesByCategory(category) {
  if (!currentSignatures) currentSignatures = await getSignatures();

  const allCookies = await chrome.cookies.getAll({});
  const toBlock = [];

  for (const cookie of allCookies) {
    const cls = classifyCookie(cookie, currentSignatures);
    if (cls.category === category) toBlock.push(cookie);
  }

  let removed = 0;
  const blockedDomains = new Set();

  for (const cookie of toBlock) {
    try {
      const url = `http${cookie.secure ? 's' : ''}://${cookie.domain.replace(/^\./, '')}${cookie.path}`;
      await chrome.cookies.remove({ url, name: cookie.name });
      removed++;
      blockedDomains.add(cookie.domain.replace(/^\./, ''));
    } catch (e) { /* Skip failures */ }
  }

  // Add declarative net request rules to prevent re-loading
  if (blockedDomains.size > 0) {
    const ruleId = Date.now();
    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: [{
        id: ruleId,
        priority: 1,
        action: { type: 'block' },
        condition: {
          requestDomains: [...blockedDomains],
          resourceTypes: ['script', 'xmlhttprequest', 'sub_frame']
        }
      }],
      removeRuleIds: []
    });
  }

  return { blocked: removed, domains: [...blockedDomains] };
}

async function generateExport(format = 'json') {
  if (!currentSignatures) currentSignatures = await getSignatures();

  const allCookies = await chrome.cookies.getAll({});
  const report = {
    generatedAt: new Date().toISOString(),
    totalCookies: allCookies.length,
    summary: { essential: 0, analytics: 0, advertising: 0, tracking: 0, unknown: 0 },
    highRiskDomains: [],
    cookies: []
  };

  for (const cookie of allCookies) {
    const cls = classifyCookie(cookie, currentSignatures);
    const risk = calculateRisk(cookie, cls);

    report.summary[cls.category] = (report.summary[cls.category] || 0) + 1;
    if (risk.level === 'high') report.highRiskDomains.push(cookie.domain);

    report.cookies.push({
      name: cookie.name,
      domain: cookie.domain,
      path: cookie.path,
      category: cls.category,
      company: cls.company,
      product: cls.product,
      riskScore: risk.score,
      riskLevel: risk.level,
      description: cls.description,
      dataCollected: cls.dataCollected || [],
      security: {
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite,
        expirationDate: cookie.expirationDate
          ? new Date(cookie.expirationDate * 1000).toISOString()
          : 'session'
      }
    });
  }

  report.highRiskDomains = [...new Set(report.highRiskDomains)].sort();
  return report;
}

function notifyContentScript(domain, classification, risk, removed) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.url && tab.url.includes(domain.replace(/^\./, ''))) {
        chrome.tabs.sendMessage(
          tab.id,
          { type: 'cookieEvent', classification, risk, removed, domain }
        ).catch(() => {});
      }
    });
  });
}

// ============================================
// MESSAGE HANDLER
// ============================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getCookiesForTab') {
    getCookiesForActiveTab().then(sendResponse);
    return true;
  }

  if (request.action === 'detectSyncs') {
    getCookiesForActiveTab().then(cookies => {
      const syncs = detectSyncGroups(cookies);
      sendResponse({ syncs });
    });
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

  if (request.action === 'openPopup') {
    chrome.action.openPopup();
    sendResponse({ success: true });
    return true;
  }

  return false;
});

// ============================================
// EVENT LISTENERS
// ============================================

chrome.cookies.onChanged.addListener(async (changeInfo) => {
  const { cookie, removed, cause } = changeInfo;
  if (cause === 'explicit' && removed) return;

  if (!currentSignatures) currentSignatures = await getSignatures();

  const classification = classifyCookie(cookie, currentSignatures);
  const riskScore = calculateRisk(cookie, classification);

  updateBadge();

  if (!removed && riskScore.level === 'high' && classification.category === 'tracking') {
    notifyContentScript(cookie.domain, classification, riskScore, removed);
  }
});

chrome.tabs.onActivated.addListener(updateBadge);
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') updateBadge();
});