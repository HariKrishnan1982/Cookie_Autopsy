// background.js
import { getSignatures } from './lib/signature-manager.js';
import { classifyCookie } from './lib/classifier.js';
import { calculateRisk } from './lib/risk-scorer.js';
import './lib/polyfill.js'; // If using modules
// OR
// (No import needed if you paste the polyfill code directly at the top of each file)

let currentSignatures = null;

// Initialize signatures on startup
(async () => {
  currentSignatures = await getSignatures();
})();

// ... [Rest of your existing background logic, but replace SIGNATURES constant with currentSignatures] ...

// Example of how to use it in getCookiesForActiveTab:
async function getCookiesForActiveTab() {
  if (!currentSignatures) currentSignatures = await getSignatures();
  
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return [];
  
  const url = new URL(tab.url);
  const cookies = await chrome.cookies.getAll({ domain: url.hostname });
  
  return cookies.map(cookie => {
    const classification = classifyCookie(cookie, currentSignatures);
    const riskScore = calculateRisk(cookie, classification);
    return { ...cookie, classification, riskScore };
  });
}

// ... [Keep your chrome.runtime.onMessage listener here] ...