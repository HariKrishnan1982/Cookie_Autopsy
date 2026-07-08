// popup.js
// The UI logic — fetches cookies, displays them, handles clicks

document.addEventListener('DOMContentLoaded', async () => {
  // Get current tab info
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const siteName = tab?.url ? new URL(tab.url).hostname : 'Unknown site';
  document.getElementById('siteName').textContent = siteName;
  
  // Fetch and display cookies
  let allCookies = [];
  try {
    allCookies = await chrome.runtime.sendMessage({ action: 'getCookiesForTab' });
  } catch (e) {
    document.getElementById('cookieList').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔒</div>
        <div>Can't read cookies on this page.<br>Try a regular website.</div>
      </div>
    `;
    return;
  }
  
  // Update summary stats
  document.getElementById('totalCount').textContent = allCookies.length;
  document.getElementById('highRiskCount').textContent = allCookies.filter(c => c.riskScore.level === 'high').length;
  document.getElementById('trackerCount').textContent = allCookies.filter(c => 
    c.classification.category === 'tracking' || c.classification.category === 'advertising'
  ).length;
  
  // Render the list
  renderCookieList(allCookies);
  
  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const filter = btn.dataset.filter;
      const filtered = filter === 'all' 
        ? allCookies 
        : allCookies.filter(c => c.classification.category === filter);
      
      renderCookieList(filtered);
    });
  });
  
  // Block trackers button
  document.getElementById('blockTrackers').addEventListener('click', async () => {
    const btn = document.getElementById('blockTrackers');
    btn.textContent = '⏳ Blocking...';
    btn.disabled = true;
    
    try {
      const result = await chrome.runtime.sendMessage({ 
        action: 'blockByCategory', 
        category: 'tracking' 
      });
      
      btn.textContent = `✅ Blocked ${result.blocked} trackers`;
      setTimeout(() => {
        btn.textContent = '🚫 Block All Trackers';
        btn.disabled = false;
      }, 2000);
    } catch (e) {
      btn.textContent = '❌ Error';
      setTimeout(() => {
        btn.textContent = '🚫 Block All Trackers';
        btn.disabled = false;
      }, 2000);
    }
  });
  
  // Export button
  document.getElementById('exportBtn').addEventListener('click', async () => {
    const btn = document.getElementById('exportBtn');
    btn.textContent = '⏳ Exporting...';
    
    try {
      const report = await chrome.runtime.sendMessage({ action: 'exportReport', format: 'json' });
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      await chrome.downloads.download({ 
        url, 
        filename: `cookie-autopsy-${siteName}-${Date.now()}.json` 
      });
      
      btn.textContent = '✅ Downloaded';
      setTimeout(() => btn.textContent = '📄 Export', 2000);
    } catch (e) {
      btn.textContent = '❌ Error';
      setTimeout(() => btn.textContent = '📄 Export', 2000);
    }
  });
});

function renderCookieList(cookies) {
  const container = document.getElementById('cookieList');
  
  if (cookies.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🍪</div>
        <div>No cookies found for this filter.</div>
      </div>
    `;
    return;
  }
  
  container.innerHTML = '';
  
  cookies.forEach(cookie => {
    const item = document.createElement('div');
    item.className = 'cookie-item';
    
    const risk = cookie.riskScore;
    const cls = cookie.classification;
    
    // Security indicators
    const secureIcon = cookie.secure ? '🔒' : '🔓';
    const httpOnlyIcon = cookie.httpOnly ? '🛡️' : '⚠️';
    
    item.innerHTML = `
      <div class="cookie-header">
        <span class="cookie-name">${escapeHtml(cookie.name)}</span>
        <span class="risk-badge risk-${risk.level}">${risk.level.toUpperCase()}</span>
      </div>
      <div class="cookie-meta">
        <span>${cls.company}</span>
        <span>·</span>
        <span>${cls.category}</span>
        <span>·</span>
        <span>${cookie.humanExpiry}</span>
      </div>
      <div class="cookie-desc">${escapeHtml(cls.description)}</div>
      <div class="cookie-details">
        <div class="detail-row">
          <span class="detail-label">Domain</span>
          <span class="detail-value">${escapeHtml(cookie.domain)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Path</span>
          <span class="detail-value">${escapeHtml(cookie.path)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Secure</span>
          <span class="detail-value ${cookie.secure ? 'good' : 'bad'}">${secureIcon} ${cookie.secure ? 'Yes' : 'No'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">HttpOnly</span>
          <span class="detail-value ${cookie.httpOnly ? 'good' : 'bad'}">${httpOnlyIcon} ${cookie.httpOnly ? 'Yes' : 'No'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">SameSite</span>
          <span class="detail-value">${cookie.sameSite || 'Not set'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Size</span>
          <span class="detail-value">${cookie.value.length} bytes</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Risk Score</span>
          <span class="detail-value">${risk.score}/100</span>
        </div>
        ${risk.reasons.length > 0 ? `
          <div class="detail-row" style="flex-direction: column; gap: 4px; margin-top: 6px;">
            <span class="detail-label">Why it's risky:</span>
            ${risk.reasons.map(r => `<span class="detail-value" style="margin-left: 8px;">• ${escapeHtml(r)}</span>`).join('')}
          </div>
        ` : ''}
      </div>
    `;
    
    // Toggle expand on click
    item.addEventListener('click', (e) => {
      // Don't toggle if clicking a button inside
      if (e.target.tagName === 'BUTTON') return;
      item.classList.toggle('expanded');
    });
    
    container.appendChild(item);
  });
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}