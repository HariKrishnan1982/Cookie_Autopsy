// lib/signature-manager.js
const REMOTE_SIG_URL = 'https://raw.githubusercontent.com/your-repo/cookie-autopsy/main/signatures.json'; // Replace with your actual URL later
const STORAGE_KEY = 'cookie_signatures';
const LAST_UPDATE_KEY = 'sig_last_update';

export async function getSignatures() {
  // 1. Try to get from local storage first (Fast Layer)
  const stored = await chrome.storage.local.get([STORAGE_KEY, LAST_UPDATE_KEY]);
  
  // 2. Check if we need an update (e.g., older than 24 hours)
  const now = Date.now();
  const lastUpdate = stored[LAST_UPDATE_KEY] || 0;
  const isStale = (now - lastUpdate) > (24 * 60 * 60 * 1000);

  if (!stored[STORAGE_KEY] || isStale) {
    try {
      // 3. Fetch from API (Smart Layer)
      const response = await fetch(REMOTE_SIG_URL);
      if (response.ok) {
        const data = await response.json();
        await chrome.storage.local.set({
          [STORAGE_KEY]: data,
          [LAST_UPDATE_KEY]: now
        });
        return data;
      }
    } catch (e) {
      console.warn('Failed to fetch remote signatures, using local fallback.');
    }
  }

  // 4. Return stored or empty fallback
  return stored[STORAGE_KEY] || { signatures: [], domainMappings: {} };
}