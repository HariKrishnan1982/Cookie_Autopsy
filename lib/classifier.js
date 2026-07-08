// lib/classifier.js
// Reads a cookie and matches it against our signature database

import signatures from './signatures.json' assert { type: 'json' };

// Cache for performance
const patternCache = new Map();

// Build regex patterns from wildcard signatures like "_hjSession*"
function buildPattern(pattern) {
  if (patternCache.has(pattern)) return patternCache.get(pattern);
  
  // Convert wildcard * to regex .* and escape other special chars
  const regex = new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
  patternCache.set(pattern, regex);
  return regex;
}

// Main function: take a cookie object, return human-readable info
export function classifyCookie(cookie) {
  const { name, value, domain } = cookie;
  
  // 1. Try exact name match against our database
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
  
  // 2. Try domain-based inference (e.g., cookie from doubleclick.net = Google Ads)
  const domainInfo = inferFromDomain(domain);
  if (domainInfo) {
    return {
      ...domainInfo,
      confidence: 0.7,
      matchType: 'domain'
    };
  }
  
  // 3. Heuristic analysis for unknown cookies
  const heuristic = analyzeHeuristics(name, value);
  if (heuristic) {
    return {
      company: 'Unknown',
      product: 'Unknown',
      ...heuristic,
      confidence: heuristic.confidence,
      matchType: 'heuristic'
    };
  }
  
  // 4. Complete unknown — flag for investigation
  return {
    company: 'Unknown',
    product: 'Unknown',
    category: 'unknown',
    risk: 'unknown',
    description: 'No info available — this cookie is not in our database. Could be harmless, could be sneaky.',
    crossSite: null,
    dataCollected: [],
    confidence: 0,
    matchType: 'unknown'
  };
}

// Check if the cookie's domain matches known tracker domains
function inferFromDomain(domain) {
  const cleanDomain = domain.replace(/^\./, ''); // remove leading dot
  
  for (const [trackerDomain, info] of Object.entries(signatures.domainMappings)) {
    if (cleanDomain.includes(trackerDomain)) {
      return {
        company: info.company,
        product: info.product,
        category: info.category,
        risk: info.risk,
        description: `Cookie from ${info.company}'s ${info.product} service`,
        crossSite: true,
        dataCollected: ['pages_visited', 'interactions']
      };
    }
  }
  return null;
}

// Guess what an unknown cookie does based on its name and value
function analyzeHeuristics(name, value) {
  const lowerName = name.toLowerCase();
  
  // Session management
  if (lowerName.includes('session') || lowerName.includes('sess') || lowerName === 'sid') {
    return {
      category: 'essential',
      risk: 'low',
      description: 'Likely keeps you logged in while you browse',
      crossSite: false,
      dataCollected: ['session_token'],
      confidence: 0.6
    };
  }
  
  // Shopping cart
  if (lowerName.includes('cart') || lowerName.includes('basket') || lowerName.includes('bag')) {
    return {
      category: 'essential',
      risk: 'low',
      description: 'Likely remembers items in your shopping cart',
      crossSite: false,
      dataCollected: ['cart_items'],
      confidence: 0.8
    };
  }
  
  // Preferences
  if (lowerName.includes('pref') || lowerName.includes('settings') || lowerName.includes('theme') || lowerName.includes('lang')) {
    return {
      category: 'essential',
      risk: 'low',
      description: 'Likely stores your preferences like language or dark mode',
      crossSite: false,
      dataCollected: ['user_preferences'],
      confidence: 0.7
    };
  }
  
  // CSRF protection
  if (lowerName.includes('csrf') || lowerName.includes('xsrf') || lowerName === 'token') {
    return {
      category: 'essential',
      risk: 'low',
      description: 'Likely protects you from fake form submissions',
      crossSite: false,
      dataCollected: ['security_token'],
      confidence: 0.7
    };
  }
  
  // Consent banner
  if (lowerName.includes('consent') || lowerName.includes('cookie') || lowerName.includes('gdpr') || lowerName.includes('ccpa')) {
    return {
      category: 'essential',
      risk: 'low',
      description: 'Likely remembers your cookie consent choice',
      crossSite: false,
      dataCollected: ['consent_preferences'],
      confidence: 0.8
    };
  }
  
  // Analytics patterns (often start with underscore + 2-3 letters)
  if (/^_[a-z]{2,3}_/.test(name) || /^_[a-z]{2,3}$/.test(name)) {
    return {
      category: 'analytics',
      risk: 'medium',
      description: 'Looks like an analytics cookie — tracks how you use the site',
      crossSite: false,
      dataCollected: ['pages_visited', 'events'],
      confidence: 0.4
    };
  }
  
  // Large encoded values = likely tracking
  if (value.length > 500 && /^[A-Za-z0-9+/=]{100,}$/.test(value)) {
    return {
      category: 'tracking',
      risk: 'medium',
      description: 'Large encoded value — may contain tracking or identification data',
      crossSite: null,
      dataCollected: ['unknown_encoded_data'],
      confidence: 0.3
    };
  }
  
  // UUID-like values
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return {
      category: 'analytics',
      risk: 'low',
      description: 'Looks like a unique visitor ID — probably for counting visitors',
      crossSite: false,
      dataCollected: ['visitor_id'],
      confidence: 0.5
    };
  }
  
  return null;
}

// Helper: check if a cookie is third-party (not from the current site)
export function isThirdParty(cookie, currentDomain) {
  const cookieDomain = cookie.domain.replace(/^\./, '');
  const current = currentDomain.replace(/^www\./, '');
  return !current.endsWith(cookieDomain) && cookieDomain !== current;
}