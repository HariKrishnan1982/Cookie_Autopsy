// background.js - Professional Modular Architecture v1.2
import { getSignatures } from './lib/signature-manager.js';
import { classifyCookie } from './lib/classifier.js';
import { calculateRisk } from './lib/risk-scorer.js';
import { detectSyncGroups } from './lib/sync-detector.js';

// Global signature cache
let currentSignatures = null;

// In-memory tab detected cookies log: tabId -> { "name::domain": cookieDetails }
const tabDetectedCookies = {};

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

// Helper: get cookie url for chrome.cookies API
function getCookieUrl(cookie) {
  let domain = cookie.domain;
  if (domain.startsWith('.')) {
    domain = domain.substring(1);
  }
  const protocol = cookie.secure ? 'https' : 'http';
  return `${protocol}://${domain}${cookie.path || '/'}`;
}

// Check if a cookie is blocked under active rules
async function isCookieBlocked(cookie, classification) {
  const data = await chrome.storage.local.get('blocked_cookies');
  const blocks = data.blocked_cookies || { individual: {}, categories: {}, domains: {} };
  
  // 1. Check individual block
  const individualKey = `${cookie.name}::${cookie.domain}`;
  if (blocks.individual && blocks.individual[individualKey]) {
    return true;
  }
  
  // 2. Check category block
  const category = classification.category || 'unknown';
  if (blocks.categories && blocks.categories[category]) {
    return true;
  }
  
  // 3. Check domain block
  const cleanDomain = cookie.domain.replace(/^\./, '');
  if (blocks.domains) {
    for (const d of Object.keys(blocks.domains)) {
      if (blocks.domains[d] && cleanDomain.includes(d)) {
        return true;
      }
    }
  }
  
  return false;
}

// Record a detected cookie into matching tabs' log
async function recordDetectedCookie(cookie, classification, riskScore, isBlocked) {
  try {
    const tabs = await chrome.tabs.query({});
    const cookieDomain = cookie.domain.replace(/^\./, '');
    
    for (const tab of tabs) {
      if (!tab.url) continue;
      try {
        const tabUrl = new URL(tab.url);
        const tabHostname = tabUrl.hostname;
        
        if (tabHostname.includes(cookieDomain) || cookieDomain.includes(tabHostname)) {
          if (!tabDetectedCookies[tab.id]) {
            tabDetectedCookies[tab.id] = {};
          }
          const key = `${cookie.name}::${cookie.domain}`;
          tabDetectedCookies[tab.id][key] = {
            name: cookie.name,
            domain: cookie.domain,
            path: cookie.path,
            secure: cookie.secure,
            httpOnly: cookie.httpOnly,
            sameSite: cookie.sameSite,
            expirationDate: cookie.expirationDate,
            classification,
            riskScore,
            blocked: isBlocked,
            active: !isBlocked,
            humanExpiry: cookie.expirationDate
              ? new Date(cookie.expirationDate * 1000).toLocaleDateString()
              : 'Session'
          };
        }
      } catch (err) {}
    }
  } catch (e) {
    console.error('[Cookie Autopsy] Error recording detected cookie:', e);
  }
}

// ============================================
// CORE COOKIE FUNCTIONS
// ============================================

async function getCookiesForActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return [];

  const tabId = tab.id;
  const url = new URL(tab.url);
  const hostname = url.hostname;

  // Ensure signatures are loaded
  if (!currentSignatures) currentSignatures = await getSignatures();

  // Get active cookies for host and parent domains
  let cookies = await chrome.cookies.getAll({ domain: hostname });
  const parts = hostname.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    const parentDomain = '.' + parts.slice(i).join('.');
    try {
      const parentCookies = await chrome.cookies.getAll({ domain: parentDomain });
      cookies = cookies.concat(parentCookies);
    } catch (e) {}
  }

  // Deduplicate
  const seen = new Set();
  const uniqueActive = [];
  for (const cookie of cookies) {
    const key = `${cookie.name}@${cookie.domain}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueActive.push(cookie);
    }
  }

  // Initialize tab log
  if (!tabDetectedCookies[tabId]) {
    tabDetectedCookies[tabId] = {};
  }

  // Fetch current blocklists
  const data = await chrome.storage.local.get('blocked_cookies');
  const blocks = data.blocked_cookies || { individual: {}, categories: {}, domains: {} };

  // Add/update active cookies in log
  for (const cookie of uniqueActive) {
    const classification = classifyCookie(cookie, currentSignatures);
    const riskScore = calculateRisk(cookie, classification);
    
    const key = `${cookie.name}::${cookie.domain}`;
    const category = classification.category || 'unknown';
    const cleanDomain = cookie.domain.replace(/^\./, '');
    
    let isBlocked = !!(blocks.individual && blocks.individual[key]) || 
                    !!(blocks.categories && blocks.categories[category]);
    
    if (!isBlocked && blocks.domains) {
      for (const d of Object.keys(blocks.domains)) {
        if (blocks.domains[d] && cleanDomain.includes(d)) {
          isBlocked = true;
          break;
        }
      }
    }

    tabDetectedCookies[tabId][key] = {
      name: cookie.name,
      domain: cookie.domain,
      path: cookie.path,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite,
      expirationDate: cookie.expirationDate,
      classification,
      riskScore,
      blocked: isBlocked,
      active: !isBlocked,
      humanExpiry: cookie.expirationDate
        ? new Date(cookie.expirationDate * 1000).toLocaleDateString()
        : 'Session'
    };
  }

  // Sync active states for everything in log
  const activeKeys = new Set(uniqueActive.map(c => `${c.name}::${c.domain}`));
  for (const key of Object.keys(tabDetectedCookies[tabId])) {
    const cookieObj = tabDetectedCookies[tabId][key];
    const category = cookieObj.classification.category || 'unknown';
    const cleanDomain = cookieObj.domain.replace(/^\./, '');
    
    let isBlocked = !!(blocks.individual && blocks.individual[key]) || 
                    !!(blocks.categories && blocks.categories[category]);
    
    if (!isBlocked && blocks.domains) {
      for (const d of Object.keys(blocks.domains)) {
        if (blocks.domains[d] && cleanDomain.includes(d)) {
          isBlocked = true;
          break;
        }
      }
    }

    cookieObj.blocked = isBlocked;
    cookieObj.active = activeKeys.has(key) && !isBlocked;
  }

  return Object.values(tabDetectedCookies[tabId]).sort((a, b) => b.riskScore.score - a.riskScore.score);
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

// Individual block toggling
async function toggleBlockIndividual(name, domain, block) {
  const data = await chrome.storage.local.get('blocked_cookies');
  const blocks = data.blocked_cookies || { individual: {}, categories: {}, domains: {} };
  
  if (!blocks.individual) blocks.individual = {};
  
  const key = `${name}::${domain}`;
  if (block) {
    blocks.individual[key] = true;
    
    // Remove immediately
    const matched = await chrome.cookies.getAll({ name, domain });
    for (const cookie of matched) {
      try {
        const url = getCookieUrl(cookie);
        await chrome.cookies.remove({ url, name: cookie.name });
      } catch (e) {}
    }
  } else {
    delete blocks.individual[key];
  }
  
  await chrome.storage.local.set({ blocked_cookies: blocks });
  return { success: true };
}

// Bulk block toggling
async function blockMultiple(cookiesToBlock, block) {
  const data = await chrome.storage.local.get('blocked_cookies');
  const blocks = data.blocked_cookies || { individual: {}, categories: {}, domains: {} };
  
  if (!blocks.individual) blocks.individual = {};
  
  for (const c of cookiesToBlock) {
    const key = `${c.name}::${c.domain}`;
    if (block) {
      blocks.individual[key] = true;
      
      // Remove immediately
      const matched = await chrome.cookies.getAll({ name: c.name, domain: c.domain });
      for (const cookie of matched) {
        try {
          const url = getCookieUrl(cookie);
          await chrome.cookies.remove({ url, name: cookie.name });
        } catch (e) {}
      }
    } else {
      delete blocks.individual[key];
    }
  }
  
  await chrome.storage.local.set({ blocked_cookies: blocks });
  return { success: true };
}

// Category-wide blocking
async function toggleBlockCategory(category, block) {
  const data = await chrome.storage.local.get('blocked_cookies');
  const blocks = data.blocked_cookies || { individual: {}, categories: {}, domains: {} };
  
  if (!blocks.categories) blocks.categories = {};
  blocks.categories[category] = block;
  
  if (block) {
    // Delete all current cookies matching this category
    const allCookies = await chrome.cookies.getAll({});
    if (!currentSignatures) currentSignatures = await getSignatures();
    
    for (const cookie of allCookies) {
      const cls = classifyCookie(cookie, currentSignatures);
      if (cls.category === category) {
        try {
          const url = getCookieUrl(cookie);
          await chrome.cookies.remove({ url, name: cookie.name });
        } catch (e) {}
      }
    }
  }
  
  await chrome.storage.local.set({ blocked_cookies: blocks });
  return { success: true };
}

async function clearAllBlocks() {
  const emptyBlocks = {
    individual: {},
    categories: {
      essential: false,
      analytics: false,
      advertising: false,
      tracking: false,
      unknown: false
    },
    domains: {}
  };
  await chrome.storage.local.set({ blocked_cookies: emptyBlocks });
  return { success: true };
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

    const cat = cls.category || 'unknown';
    report.summary[cat] = (report.summary[cat] || 0) + 1;
    if (risk.level === 'high') report.highRiskDomains.push(cookie.domain);

    report.cookies.push({
      name: cookie.name,
      domain: cookie.domain,
      path: cookie.path,
      category: cat,
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

  if (request.action === 'toggleBlockIndividual') {
    toggleBlockIndividual(request.name, request.domain, request.block).then(sendResponse);
    return true;
  }

  if (request.action === 'blockMultiple') {
    blockMultiple(request.cookies, request.block).then(sendResponse);
    return true;
  }

  if (request.action === 'toggleBlockCategory') {
    toggleBlockCategory(request.category, request.block).then(sendResponse);
    return true;
  }

  if (request.action === 'blockByCategory') {
    toggleBlockCategory(request.category, true).then(sendResponse);
    return true;
  }

  if (request.action === 'clearAllBlocks') {
    clearAllBlocks().then(sendResponse);
    return true;
  }

  if (request.action === 'getBlockedCookies') {
    chrome.storage.local.get('blocked_cookies').then(data => {
      sendResponse(data.blocked_cookies || { individual: {}, categories: {}, domains: {} });
    });
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
  if (removed) return;
  if (cause === 'explicit') return;

  if (!currentSignatures) currentSignatures = await getSignatures();

  const classification = classifyCookie(cookie, currentSignatures);
  const blocked = await isCookieBlocked(cookie, classification);
  
  const riskScore = calculateRisk(cookie, classification);

  if (blocked) {
    try {
      const url = getCookieUrl(cookie);
      await chrome.cookies.remove({ url, name: cookie.name });
      console.log(`[Cookie Autopsy] Auto-removed blocked cookie: ${cookie.name} from ${cookie.domain}`);
      await recordDetectedCookie(cookie, classification, riskScore, true);
    } catch (e) {
      console.error('[Cookie Autopsy] Failed to auto-remove blocked cookie:', e);
    }
  } else {
    await recordDetectedCookie(cookie, classification, riskScore, false);
    updateBadge();

    if (riskScore.level === 'high' && classification.category === 'tracking') {
      notifyContentScript(cookie.domain, classification, riskScore, removed);
    }
  }
});

chrome.tabs.onActivated.addListener(updateBadge);
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading') {
    tabDetectedCookies[tabId] = {};
  }
  if (changeInfo.status === 'complete') {
    updateBadge();
  }
});