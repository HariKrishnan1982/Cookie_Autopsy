// lib/classifier.js
// Note: This file now expects signatures to be passed as a parameter

const patternCache = new Map();

function buildPattern(pattern) {
  if (patternCache.has(pattern)) return patternCache.get(pattern);
  const regex = new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
  patternCache.set(pattern, regex);
  return regex;
}

export function classifyCookie(cookie, signatures) {
  const { name, value, domain } = cookie;

  // 1. Exact match against signatures
  if (signatures && signatures.signatures) {
    for (const sig of signatures.signatures) {
      for (const pattern of sig.patterns) {
        const regex = buildPattern(pattern);
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
  }

  // 2. Domain-based inference
  if (signatures && signatures.domainMappings) {
    const cleanDomain = domain.replace(/^\./, '');
    for (const [trackerDomain, info] of Object.entries(signatures.domainMappings)) {
      if (cleanDomain.includes(trackerDomain)) {
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
  }

  // 3. Heuristic analysis (Fallback)
  const lowerName = name.toLowerCase();
  if (lowerName.includes('session') || lowerName.includes('sess')) {
    return { company: 'Unknown', product: 'Session', category: 'essential', risk: 'low', description: 'Likely keeps you logged in', crossSite: false, dataCollected: ['session_token'], confidence: 0.6, matchType: 'heuristic' };
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

export function isThirdParty(cookie, currentDomain) {
  const cookieDomain = cookie.domain.replace(/^\./, '');
  const current = currentDomain.replace(/^www\./, '');
  return !current.endsWith(cookieDomain) && cookieDomain !== current;
}