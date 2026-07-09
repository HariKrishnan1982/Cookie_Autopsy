// popup.js

// 1. Professional Polyfill for Firefox/Chrome compatibility
if (typeof browser !== 'undefined') {
  window.chrome = browser;
}

document.addEventListener('DOMContentLoaded', async () => {
  // Get current tab info
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const siteName = tab?.url ? new URL(tab.url).hostname : 'Unknown site';
  
  const siteNameEl = document.getElementById('siteName');
  if (siteNameEl) siteNameEl.textContent = siteName;

  // Fetch and display cookies
  let allCookies = [];
  try {
    allCookies = await chrome.runtime.sendMessage({ action: 'getCookiesForTab' });
  } catch (e) {
    const list = document.getElementById('cookieList');
    if (list) {
      list.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔒</div><div>Can't read cookies on this page.<br>Try a regular website.</div></div>`;
    }
    return;
  }

  // Update summary stats
  const trackers = allCookies.filter(c => c.classification.category === 'tracking' || c.classification.category === 'advertising');
  const essential = allCookies.filter(c => c.classification.category === 'essential');
  
  const totalCountEl = document.getElementById('totalCount');
  const trackerCountEl = document.getElementById('trackerCount');
  const essentialCountEl = document.getElementById('essentialCount');

  if (totalCountEl) totalCountEl.textContent = allCookies.length;
  if (trackerCountEl) trackerCountEl.textContent = trackers.length;
  if (essentialCountEl) essentialCountEl.textContent = essential.length;

  // Calculate average risk score for header (Industrial Dashboard Feature)
  if (allCookies.length > 0) {
    const totalScore = allCookies.reduce((acc, c) => acc + c.riskScore.score, 0);
    const avgScore = Math.round(totalScore / allCookies.length);
    const scoreEl = document.getElementById('totalScore');
    const statusEl = document.getElementById('riskStatus');
    
    if (scoreEl) {
      scoreEl.textContent = avgScore;
      scoreEl.style.color = avgScore > 60 ? 'var(--danger)' : avgScore > 30 ? 'var(--warning)' : 'var(--success)';
    }
    if (statusEl) {
      statusEl.textContent = avgScore > 60 ? 'High Risk Environment' : avgScore > 30 ? 'Moderate Tracking' : 'Low Risk';
    }
  }

  // Render the list
  renderCookieList(allCookies);

  // Check for Tracker Syncs (Forensic Mode)
  try {
    const syncResult = await chrome.runtime.sendMessage({ action: 'detectSyncs' });
    if (syncResult && syncResult.syncs && syncResult.syncs.length > 0) {
      const alertBox = document.getElementById('syncAlert');
      const desc = document.getElementById('syncDesc');
      
      if (alertBox && desc) {
        const companies = syncResult.syncs[0].companies.join(', ');
        desc.textContent = `${companies} are sharing your ID.`;
        alertBox.style.display = 'flex';
        
        // Optional: Click to see more details
        alertBox.addEventListener('click', () => {
          console.log('Sync Details:', syncResult.syncs);
        });
      }
    }
  } catch (e) {
    console.warn('Sync detection not available or failed.', e);
  }

  // Filter buttons
  document.querySelectorAll('.filter').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.dataset.filter;
      const filtered = filter === 'all' 
        ? allCookies 
        : allCookies.filter(c => c.classification.category === filter);
      renderCookieList(filtered);
    });
  });

  // Block trackers button
  const blockBtn = document.getElementById('blockTrackers');
  if (blockBtn) {
    blockBtn.addEventListener('click', async () => {
      blockBtn.textContent = '⏳ Blocking...';
      blockBtn.disabled = true;
      try {
        const result = await chrome.runtime.sendMessage({ 
          action: 'blockByCategory', 
          category: 'tracking' 
        });
        blockBtn.textContent = `✅ Blocked ${result.blocked}`;
        setTimeout(() => {
          blockBtn.textContent = 'Block Trackers';
          blockBtn.disabled = false;
          // Refresh list to show changes
          window.location.reload();
        }, 2000);
      } catch (e) {
        blockBtn.textContent = '❌ Error';
        setTimeout(() => {
          blockBtn.textContent = 'Block Trackers';
          blockBtn.disabled = false;
        }, 2000);
      }
    });
  }

  // Export button
  const exportBtn = document.getElementById('exportBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
      exportBtn.textContent = '⏳ Exporting...';
      try {
        const report = await chrome.runtime.sendMessage({ action: 'exportReport', format: 'json' });
        const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        await chrome.downloads.download({ 
          url, 
          filename: `cookie-autopsy-${siteName}-${Date.now()}.json` 
        });
        exportBtn.textContent = '✅ Downloaded';
        setTimeout(() => exportBtn.textContent = 'Export JSON', 2000);
      } catch (e) {
        exportBtn.textContent = '❌ Error';
        setTimeout(() => exportBtn.textContent = 'Export JSON', 2000);
      }
    });
  }
});

function renderCookieList(cookies) {
  const container = document.getElementById('cookieList');
  if (!container) return;

  if (cookies.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🍪</div><div>No cookies found for this filter.</div></div>`;
    return;
  }

  container.innerHTML = '';
  cookies.forEach(cookie => {
    const item = document.createElement('div');
    item.className = 'cookie-item';
    const risk = cookie.riskScore;
    const cls = cookie.classification;

    item.innerHTML = `
      <div class="cookie-header">
        <span class="cookie-name">${escapeHtml(cookie.name)}</span>
        <span class="risk-badge risk-${risk.level}">${risk.level}</span>
      </div>
      <div class="cookie-desc">${escapeHtml(cls.description)}</div>
      <div class="cookie-details">
        <div class="detail-row">
          <span class="detail-label">Company</span>
          <span class="detail-value">${escapeHtml(cls.company)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Domain</span>
          <span class="detail-value">${escapeHtml(cookie.domain)}</span>
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

    item.addEventListener('click', () => {
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