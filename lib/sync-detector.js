// lib/sync-detector.js

/**
 * Detects if multiple trackers are sharing the same user ID.
 * @param {Array} cookies - The list of classified cookies from the current tab.
 * @returns {Array} - A list of sync groups found.
 */
export function detectSyncGroups(cookies) {
  const syncGroups = [];
  const valueMap = new Map(); // Maps cookie value -> list of cookies

  // 1. Filter for high-risk/tracking cookies only
  const trackingCookies = cookies.filter(c => 
    c.classification.category === 'tracking' || 
    c.classification.category === 'advertising'
  );

  // 2. Map values to their owners
  for (const cookie of trackingCookies) {
    // We look for UUIDs or long alphanumeric strings that look like IDs
    if (isLikelyIdentifier(cookie.value)) {
      const normalizedValue = normalizeValue(cookie.value);
      
      if (!valueMap.has(normalizedValue)) {
        valueMap.set(normalizedValue, []);
      }
      valueMap.get(normalizedValue).push(cookie);
    }
  }

  // 3. Identify groups where more than one company shares an ID
  for (const [value, group] of valueMap.entries()) {
    if (group.length > 1) {
      // Ensure they are actually different companies/domains
      const uniqueCompanies = new Set(group.map(c => c.classification.company));
      if (uniqueCompanies.size > 1) {
        syncGroups.push({
          sharedId: value.substring(0, 12) + '...', // Hide full ID for privacy in UI
          companies: Array.from(uniqueCompanies),
          cookieCount: group.length,
          riskLevel: 'critical',
          description: `These companies appear to be sharing the same user ID (${value.substring(0, 8)}...) to link your profiles.`
        });
      }
    }
  }

  return syncGroups;
}

/**
 * Checks if a value looks like a unique identifier (UUID, hash, etc.)
 */
function isLikelyIdentifier(value) {
  if (!value || value.length < 10) return false;
  // UUID pattern or long hex string
  return /^[0-9a-fA-F]{8,}-?[0-9a-fA-F]{4,}/.test(value) || 
         /^[A-Za-z0-9_-]{16,}$/.test(value);
}

/**
 * Normalizes values to catch slight variations (e.g. version prefixes)
 */
function normalizeValue(value) {
  return value.replace(/^[vV]\d+[-_]?/, '').toLowerCase();
}