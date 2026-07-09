// popup.js
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
    document.getElementById('cookieList').innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔒</div><div>Can't read cookies on this page.<br>Try a regular website.</div></div>`;
    return;
  }

  // Update summary stats
  const trackers = allCookies.filter(c => c.classification.category === 'tracking' || c.classification.category === 'advertising');
  const essential = allCookies.filter(c => c.classification.category === 'essential');
  
  document.getElementById('totalCount').textContent = allCookies.length;
  document.getElementById('trackerCount').textContent = trackers.length;
  document.getElementById('essentialCount').textContent = essential.length;

  // Calculate average risk score for header
  if (allCookies.length > 0) {
    const totalScore = allCookies.reduce((acc, c) => acc + c.riskScore.score, 0);
    const avgScore = Math.round(totalScore / allCookies.length);
    const scoreEl = document.getElementById('totalScore');
    scoreEl.textContent = avgScore;
    scoreEl.style.color = avgScore > 60 ? 'var(--danger)' : avgScore > 30 ? 'var(--warning)' : 'var(--success)';
    document.getElementById('riskStatus').textContent = avgScore > 60 ? 'High Risk Environment' : avgScore > 30 ? 'Moderate Tracking' : 'Low Risk';
  }

  // Render the list
  renderCookieList(allCookies);

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
  document.getElementById('blockTrackers').addEventListener('click', async () => {
    const btn = document.getElementById('blockTrackers');
    btn.textContent = '⏳ Blocking...';
    btn.disabled = true;
    try {
      const result = await chrome.runtime.sendMessage({ 
        action: 'blockByCategory', 
        category: 'tracking' 
      });
      btn.textContent = `✅ Blocked ${result.blocked}`;
      setTimeout(() => {
        btn.textContent = 'Block Trackers';
        btn.disabled = false;
        // Refresh list
        window.location.reload();
      }, 2000);
    } catch (e) {
      btn.textContent = '❌ Error';
      setTimeout(() => {
        btn.textContent = 'Block Trackers';
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
      setTimeout(() => btn.textContent = 'Export JSON', 2000);
    } catch (e) {
      btn.textContent = '❌ Error';
      setTimeout(() => btn.textContent = 'Export JSON', 2000);
    }
  });
});

function renderCookieList(cookies) {
  const container = document.getElementById('cookieList');
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