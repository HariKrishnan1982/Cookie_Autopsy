// lib/risk-scorer.js
// Calculates a risk score (0-100) for any cookie

import { isThirdParty } from './classifier.js';

export function calculateRisk(cookie, classification) {
  let score = 0;
  const reasons = [];
  
  // --- THIRD-PARTY COOKIE (+30) ---
  // If it's from a different domain than the site you're visiting, it's following you around
  if (!cookie.hostOnly) {
    score += 30;
    reasons.push('Third-party cookie — follows you across different websites');
  }
  
  // --- EXPIRATION DURATION ---
  if (cookie.expirationDate) {
    const now = Date.now() / 1000;
    const daysUntilExpiry = (cookie.expirationDate - now) / 86400;
    
    if (daysUntilExpiry > 365 * 2) {
      score += 25;
      reasons.push(`Expires in ${Math.round(daysUntilExpiry / 365)} years — long-term tracking profile`);
    } else if (daysUntilExpiry > 365) {
      score += 15;
      reasons.push('Expires in more than 1 year');
    } else if (daysUntilExpiry > 30) {
      score += 5;
      reasons.push('Expires in more than 30 days');
    }
  } else {
    // Session cookie — actually good for privacy
    reasons.push('Session cookie — deleted when you close the browser');
  }
  
  // --- SECURITY FLAGS ---
  // No Secure flag = can be stolen on HTTP connections
  if (!cookie.secure) {
    score += 15;
    reasons.push('Not Secure — can be stolen if you visit the HTTP version of the site');
  }
  
  // No HttpOnly = JavaScript can read it (bad for XSS attacks)
  if (!cookie.httpOnly) {
    score += 10;
    reasons.push('Not HttpOnly — any script on the page can read this cookie');
  }
  
  // SameSite=None = sent with EVERY cross-site request (most permissive)
  if (cookie.sameSite === 'no_restriction') {
    score += 20;
    reasons.push('SameSite=None — sent with every cross-site request, maximum tracking');
  } 
  // SameSite not set = defaults to Lax in modern browsers (okay but not great)
  else if (cookie.sameSite === 'unspecified') {
    score += 5;
    reasons.push('SameSite not set — older browsers may send it cross-site');
  }
  // SameSite=Strict = only sent to same site (good!)
  else if (cookie.sameSite === 'strict') {
    reasons.push('SameSite=Strict — only sent to the same website (good)');
  }
  // SameSite=Lax = sent on top-level navigation (reasonable default)
  else if (cookie.sameSite === 'lax') {
    reasons.push('SameSite=Lax — reasonable default protection');
  }
  
  // --- KNOWN TRACKER BONUS ---
  if (classification.category === 'tracking') {
    score += 25;
    reasons.push('Known cross-site tracker — explicitly designed to follow you');
  } else if (classification.category === 'advertising') {
    score += 20;
    reasons.push('Used for ad targeting — builds a profile of your interests');
  } else if (classification.category === 'analytics') {
    score += 5;
    reasons.push('Analytics — tracks your behavior for site improvement');
  } else if (classification.category === 'essential') {
    reasons.push('Essential cookie — needed for the site to work properly');
  }
  
  // --- DATA SENSITIVITY ---
  if (classification.dataCollected && classification.dataCollected.length > 0) {
    const sensitiveData = ['location', 'purchases', 'login_status', 'search_history', 'session_recordings', 'form_interactions', 'video_engagement'];
    const hasSensitive = classification.dataCollected.some(d => sensitiveData.includes(d));
    
    if (hasSensitive) {
      score += 10;
      reasons.push('Collects sensitive personal data (location, purchases, or login status)');
    }
    
    if (classification.dataCollected.includes('session_recordings')) {
      score += 15;
      reasons.push('Records your screen/mouse movements — very invasive');
    }
  }
  
  // --- CROSS-SITE TRACKING ---
  if (classification.crossSite === true) {
    score += 10;
    reasons.push('Explicitly designed to work across multiple websites');
  }
  
  // Cap at 100
  score = Math.min(100, Math.max(0, score));
  
  // Determine risk level
  let level;
  if (score >= 60) level = 'high';
  else if (score >= 30) level = 'medium';
  else level = 'low';
  
  return {
    score,
    level,
    reasons,
    // Quick visual indicator
    emoji: level === 'high' ? '🔴' : level === 'medium' ? '🟡' : '🟢'
  };
}

// Helper: get a human-readable summary of why the cookie is risky
export function getRiskSummary(riskScore) {
  if (riskScore.level === 'high') {
    return 'This cookie is actively tracking you across the web and collecting personal data.';
  } else if (riskScore.level === 'medium') {
    return 'This cookie tracks your behavior but is less invasive than high-risk trackers.';
  } else {
    return 'This cookie is harmless — needed for the website to work properly.';
  }
}