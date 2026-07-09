// lib/signature-manager.js
const REMOTE_SIG_URL = 'https://raw.githubusercontent.com/your-username/cookie-autopsy/main/signatures.json'; // Replace with your actual raw GitHub link
const STORAGE_KEY = 'cookie_signatures_v1';
const LAST_UPDATE_KEY = 'sig_last_update_v1';
const UPDATE_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

export async function getSignatures() {
  // 1. Try to get from local storage first (The Fast Layer)
  const stored = await chrome.storage.local.get([STORAGE_KEY, LAST_UPDATE_KEY]);
  
  // 2. Check if we need an update
  const now = Date.now();
  const lastUpdate = stored[LAST_UPDATE_KEY] || 0;
  const isStale = (now - lastUpdate) > UPDATE_INTERVAL;

  if (!stored[STORAGE_KEY] || isStale) {
    try {
      // 3. Fetch from API (The Smart Layer)
      console.log('Cookie Autopsy: Checking for signature updates...');
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
      console.warn('Cookie Autopsy: Failed to fetch remote signatures, using local fallback.', e);
    }
  }

  // 4. Return stored or a minimal fallback
  return stored[STORAGE_KEY] || { signatures: [], domainMappings: {} };
}