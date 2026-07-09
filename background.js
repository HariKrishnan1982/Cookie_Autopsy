// background.js
import { getSignatures } from './lib/signature-manager.js';
import { classifyCookie } from './lib/classifier.js';
import { calculateRisk } from './lib/risk-scorer.js';
import { detectSyncGroups } from './lib/sync-detector.js'; // New Import

// ... [Keep existing initialization logic] ...

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getCookiesForTab') {
    getCookiesForActiveTab().then(sendResponse);
    return true;
  }
  
  // NEW: Handle Sync Detection Request
  if (request.action === 'detectSyncs') {
    getCookiesForActiveTab().then(cookies => {
      const syncs = detectSyncGroups(cookies);
      sendResponse({ syncs });
    });
    return true;
  }

  // ... [Keep existing block/export logic] ...
});