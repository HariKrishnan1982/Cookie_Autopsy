// lib/signature-manager.js
const REMOTE_SIG_URL = 'https://raw.githubusercontent.com/your-username/cookie-autopsy/main/signatures.json'; // Replace with your actual raw GitHub link
const STORAGE_KEY = 'cookie_signatures_v1';
const LAST_UPDATE_KEY = 'sig_last_update_v1';
const UPDATE_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

export async function getSignatures() {
  // 1. Try to get from local storage first (The Fast Layer)
  const stored = await chrome.storage.local.get([STORAGE_KEY, LAST_UPDATE_KEY]);
  
  // Load bundled signatures to compare versions
  let bundled = { signatures: [], domainMappings: {}, version: "0.0.0" };
  try {
    const localUrl = chrome.runtime.getURL('lib/signatures.json');
    const localRes = await fetch(localUrl);
    if (localRes.ok) {
      bundled = await localRes.json();
    }
  } catch (e) {
    console.error('Cookie Autopsy: Failed to load bundled local signatures:', e);
  }

  // If stored signatures version is less than bundled version, overwrite cache
  let signaturesToUse = stored[STORAGE_KEY];
  
  if (!signaturesToUse || isVersionHigher(bundled.version, signaturesToUse.version)) {
    signaturesToUse = bundled;
    await chrome.storage.local.set({
      [STORAGE_KEY]: bundled,
      [LAST_UPDATE_KEY]: Date.now()
    });
  }

  // Check if we need an update
  const now = Date.now();
  const lastUpdate = stored[LAST_UPDATE_KEY] || 0;
  const isStale = (now - lastUpdate) > UPDATE_INTERVAL;

  if (isStale) {
    try {
      console.log('Cookie Autopsy: Checking for signature updates...');
      const response = await fetch(REMOTE_SIG_URL);
      if (response.ok) {
        const remoteData = await response.json();
        if (isVersionHigher(remoteData.version, signaturesToUse.version)) {
          await chrome.storage.local.set({
            [STORAGE_KEY]: remoteData,
            [LAST_UPDATE_KEY]: now
          });
          return remoteData;
        }
      }
    } catch (e) {
      console.warn('Cookie Autopsy: Failed to fetch remote signatures, using local version.', e);
    }
  }

  return signaturesToUse;
}

// Simple semver comparator
function isVersionHigher(v1, v2) {
  if (!v1) return false;
  if (!v2) return true;
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return true;
    if (p1 < p2) return false;
  }
  return false;
}