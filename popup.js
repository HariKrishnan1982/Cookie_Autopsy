// popup.js - Professional Cookie Autopsy Controller v1.2

if (typeof browser !== 'undefined') {
  window.chrome = browser;
}

document.addEventListener('DOMContentLoaded', async () => {
  let allCookies = [];
  let selectedCookies = new Set(); // Stores 'name::domain' strings
  let activeFilter = 'all';
  let searchQuery = '';
  let activeBlocks = { individual: {}, categories: {}, domains: {} };
  let currentView = 'scanner'; // 'scanner' or 'rules'

  // DOM Elements
  const siteNameEl = document.getElementById('siteName');
  const riskStatusEl = document.getElementById('riskStatus');
  const totalScoreEl = document.getElementById('totalScore');
  const toggleViewBtn = document.getElementById('toggleViewBtn');
  
  const scannerView = document.getElementById('scannerView');
  const rulesView = document.getElementById('rulesView');

  // Stats Elements
  const totalCountEl = document.getElementById('totalCount');
  const trackerCountEl = document.getElementById('trackerCount');
  const unknownCountEl = document.getElementById('unknownCount');
  const blockedCountEl = document.getElementById('blockedCount');

  // Search & Filter Elements
  const cookieSearchInput = document.getElementById('cookieSearch');
  const filterButtons = document.querySelectorAll('.filter');

  // Bulk Drawer Elements
  const bulkActionsBar = document.getElementById('bulkActionsBar');
  const selectAllCheckbox = document.getElementById('selectAllCheckbox');
  const selectAllLabel = document.getElementById('selectAllLabel');
  const blockSelectedBtn = document.getElementById('blockSelectedBtn');
  const unblockSelectedBtn = document.getElementById('unblockSelectedBtn');

  // Cookie List
  const cookieListEl = document.getElementById('cookieList');
  
  // Settings/Rules Elements
  const blockTrackersRule = document.getElementById('blockTrackersRule');
  const blockAnalyticsRule = document.getElementById('blockAnalyticsRule');
  const blockUnknownRule = document.getElementById('blockUnknownRule');
  const blockedCookiesList = document.getElementById('blockedCookiesList');
  const resetAllBlocksBtn = document.getElementById('resetAllBlocksBtn');

  // Bottom Actions (Scanner)
  const blockTrackersBtn = document.getElementById('blockTrackers');
  const exportBtn = document.getElementById('exportBtn');

  // 1. Get current tab info
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const siteHostname = tab?.url ? new URL(tab.url).hostname : 'Unknown site';
  if (siteNameEl) siteNameEl.textContent = siteHostname;

  // 2. Fetch Initial Blocklists
  async function refreshActiveBlocks() {
    activeBlocks = await chrome.runtime.sendMessage({ action: 'getBlockedCookies' });
    
    // Set switches
    if (blockTrackersRule) blockTrackersRule.checked = !!activeBlocks.categories.tracking;
    if (blockAnalyticsRule) blockAnalyticsRule.checked = !!activeBlocks.categories.analytics;
    if (blockUnknownRule) blockUnknownRule.checked = !!activeBlocks.categories.unknown;
  }

  // 3. Load Tab Cookies
  async function loadTabCookies() {
    try {
      allCookies = await chrome.runtime.sendMessage({ action: 'getCookiesForTab' });
    } catch (e) {
      if (cookieListEl) {
        cookieListEl.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">🔒</div>
            <div>Can't read cookies on this page.<br>Try a regular website.</div>
          </div>`;
      }
      return;
    }

    // Refresh UI blocks cache
    await refreshActiveBlocks();

    // Render Stats
    updateStatsBar();

    // Render List
    filterAndRenderCookies();

    // Check for Tracker Syncs (Forensic Mode)
    checkTrackerSyncs();
  }

  // Calculate and update stats
  function updateStatsBar() {
    const total = allCookies.length;
    const trackers = allCookies.filter(c => c.classification.category === 'tracking' || c.classification.category === 'advertising').length;
    const unknown = allCookies.filter(c => c.classification.category === 'unknown').length;
    const blocked = allCookies.filter(c => c.blocked).length;

    if (totalCountEl) totalCountEl.textContent = total;
    if (trackerCountEl) trackerCountEl.textContent = trackers;
    if (unknownCountEl) unknownCountEl.textContent = unknown;
    if (blockedCountEl) blockedCountEl.textContent = blocked;

    // Risk score header logic
    const activeCookies = allCookies.filter(c => c.active);
    if (activeCookies.length > 0) {
      const totalScore = activeCookies.reduce((acc, c) => acc + c.riskScore.score, 0);
      const avgScore = Math.round(totalScore / activeCookies.length);
      
      if (totalScoreEl) {
        totalScoreEl.textContent = avgScore;
        totalScoreEl.style.color = avgScore > 60 ? 'var(--danger)' : avgScore > 30 ? 'var(--warning)' : 'var(--success)';
      }
      if (riskStatusEl) {
        riskStatusEl.textContent = avgScore > 60 ? 'High Risk Environment' : avgScore > 30 ? 'Moderate Tracking' : 'Safe Environment';
      }
    } else {
      if (totalScoreEl) totalScoreEl.textContent = '0';
      if (riskStatusEl) riskStatusEl.textContent = 'Safe (No Active Cookies)';
    }
  }

  // Filter, Search, and Render Cookies
  function filterAndRenderCookies() {
    if (!cookieListEl) return;

    let filtered = allCookies;

    // Apply Filter Tab
    if (activeFilter !== 'all') {
      if (activeFilter === 'tracking') {
        filtered = filtered.filter(c => c.classification.category === 'tracking' || c.classification.category === 'advertising');
      } else {
        filtered = filtered.filter(c => c.classification.category === activeFilter);
      }
    }

    // Apply Search Query
    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(c => 
        c.name.toLowerCase().includes(query) || 
        c.domain.toLowerCase().includes(query)
      );
    }

    // Render matches
    renderCookieList(filtered);
    updateBulkActionsBar(filtered);
  }

  function renderCookieList(cookies) {
    if (cookies.length === 0) {
      cookieListEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🍪</div>
          <div>No cookies found matching criteria.</div>
        </div>`;
      return;
    }

    cookieListEl.innerHTML = '';
    cookies.forEach(cookie => {
      const item = document.createElement('div');
      item.className = `cookie-item ${cookie.blocked ? 'blocked-state' : ''}`;
      
      const risk = cookie.riskScore;
      const cls = cookie.classification;
      const isUnknown = cls.category === 'unknown';
      const key = `${cookie.name}::${cookie.domain}`;

      // Checkbox display state
      const isChecked = selectedCookies.has(key);

      item.innerHTML = `
        <div class="cookie-item-main">
          <input type="checkbox" class="cookie-checkbox" data-key="${escapeHtml(key)}" ${isChecked ? 'checked' : ''}>
          <div class="cookie-info-wrap">
            <div class="cookie-header">
              <span class="cookie-name">
                ${escapeHtml(cookie.name)}
                ${cookie.blocked ? '<span class="blocked-lock-icon" title="Actively Blocked">🔒</span>' : ''}
              </span>
              <span class="risk-badge risk-${risk.level === 'unknown' ? 'unknown' : risk.level}">
                ${risk.level === 'unknown' ? 'unknown' : risk.level}
              </span>
            </div>
            <div class="cookie-desc">${escapeHtml(isUnknown ? 'Unknown purpose - not in database' : cls.description)}</div>
          </div>
        </div>
        
        <div class="cookie-details">
          <div class="detail-row">
            <span class="detail-label">Company</span>
            <span class="detail-value ${isUnknown ? 'warning' : ''}">${escapeHtml(cls.company)}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Product</span>
            <span class="detail-value ${isUnknown ? 'warning' : ''}">${escapeHtml(cls.product)}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Domain</span>
            <span class="detail-value">${escapeHtml(cookie.domain)}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Path</span>
            <span class="detail-value">${escapeHtml(cookie.path)}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Expiry</span>
            <span class="detail-value">${escapeHtml(cookie.humanExpiry || 'Session')}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Security Flags</span>
            <span class="detail-value">
              ${cookie.secure ? '🔒 Secure' : '🔓 Not Secure'} | 
              ${cookie.httpOnly ? '🚫 HttpOnly' : '📝 Script-Accessible'}
            </span>
          </div>
          
          <div class="cookie-explanation ${isUnknown ? 'unknown' : ''}">
            <strong>Cookie Explanation:</strong><br>
            ${isUnknown 
              ? '⚠️ <strong>Unknown Cookie:</strong> This cookie is not recognized in our database. It could be used for site operations, tracking, or analytics. You can block it if you experience issues or want to limit untrusted tracking.'
              : escapeHtml(cls.description)
            }
          </div>

          ${risk.reasons && risk.reasons.length > 0 ? `
            <div class="detail-row" style="flex-direction: column; gap: 4px; margin-top: 6px;">
              <span class="detail-label">Why it's risky:</span>
              ${risk.reasons.map(r => `<span class="detail-value" style="margin-left: 8px; text-align: left;">• ${escapeHtml(r)}</span>`).join('')}
            </div>
          ` : ''}

          <div class="cookie-card-actions">
            <button class="cookie-block-toggle ${cookie.blocked ? 'is-blocked' : ''}" 
                    data-name="${escapeHtml(cookie.name)}" 
                    data-domain="${escapeHtml(cookie.domain)}" 
                    data-blocked="${cookie.blocked}">
              ${cookie.blocked ? '🛡️ Blocked' : '🚫 Block Cookie'}
            </button>
          </div>
        </div>
      `;

      // Expand card on click (prevent expand on click of checkbox or toggle button)
      item.addEventListener('click', (e) => {
        if (e.target.closest('.cookie-checkbox') || e.target.closest('.cookie-block-toggle')) {
          return;
        }
        item.classList.toggle('expanded');
      });

      // Checkbox listener
      const cb = item.querySelector('.cookie-checkbox');
      cb.addEventListener('change', () => {
        if (cb.checked) {
          selectedCookies.add(key);
        } else {
          selectedCookies.delete(key);
        }
        updateBulkActionsBar(cookies);
      });

      // Individual block toggle listener
      const toggleBtn = item.querySelector('.cookie-block-toggle');
      toggleBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const name = toggleBtn.dataset.name;
        const domain = toggleBtn.dataset.domain;
        const isCurrentlyBlocked = toggleBtn.dataset.blocked === 'true';

        toggleBtn.textContent = '⏳ ...';
        
        await chrome.runtime.sendMessage({
          action: 'toggleBlockIndividual',
          name,
          domain,
          block: !isCurrentlyBlocked
        });

        // Reload data
        loadTabCookies();
      });

      cookieListEl.appendChild(item);
    });
  }

  // Update bulk drawer state based on current checked list
  function updateBulkActionsBar(renderedCookies) {
    const renderedKeys = renderedCookies.map(c => `${c.name}::${c.domain}`);
    const selectedRendered = renderedKeys.filter(key => selectedCookies.has(key));

    if (selectedRendered.length > 0) {
      if (bulkActionsBar) bulkActionsBar.style.display = 'flex';
      if (selectAllLabel) selectAllLabel.textContent = `All (${selectedRendered.length})`;
      if (selectAllCheckbox) {
        selectAllCheckbox.checked = selectedRendered.length === renderedCookies.length;
      }
    } else {
      if (bulkActionsBar) bulkActionsBar.style.display = 'none';
      if (selectAllCheckbox) selectAllCheckbox.checked = false;
    }
  }

  // Checkbox: Select All
  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', () => {
      // Find what cookies are currently visible (filtered & searched)
      let filtered = allCookies;
      if (activeFilter !== 'all') {
        if (activeFilter === 'tracking') {
          filtered = filtered.filter(c => c.classification.category === 'tracking' || c.classification.category === 'advertising');
        } else {
          filtered = filtered.filter(c => c.classification.category === activeFilter);
        }
      }
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(c => 
          c.name.toLowerCase().includes(query) || 
          c.domain.toLowerCase().includes(query)
        );
      }

      filtered.forEach(c => {
        const key = `${c.name}::${c.domain}`;
        if (selectAllCheckbox.checked) {
          selectedCookies.add(key);
        } else {
          selectedCookies.delete(key);
        }
      });

      filterAndRenderCookies();
    });
  }

  // Bulk Actions: Block Selected
  if (blockSelectedBtn) {
    blockSelectedBtn.addEventListener('click', async () => {
      if (selectedCookies.size === 0) return;
      blockSelectedBtn.textContent = '⏳ ...';
      blockSelectedBtn.disabled = true;

      const cookiesToBlock = Array.from(selectedCookies).map(key => {
        const [name, domain] = key.split('::');
        return { name, domain };
      });

      await chrome.runtime.sendMessage({
        action: 'blockMultiple',
        cookies: cookiesToBlock,
        block: true
      });

      selectedCookies.clear();
      blockSelectedBtn.textContent = 'Block';
      blockSelectedBtn.disabled = false;
      loadTabCookies();
    });
  }

  // Bulk Actions: Unblock Selected
  if (unblockSelectedBtn) {
    unblockSelectedBtn.addEventListener('click', async () => {
      if (selectedCookies.size === 0) return;
      unblockSelectedBtn.textContent = '⏳ ...';
      unblockSelectedBtn.disabled = true;

      const cookiesToUnblock = Array.from(selectedCookies).map(key => {
        const [name, domain] = key.split('::');
        return { name, domain };
      });

      await chrome.runtime.sendMessage({
        action: 'blockMultiple',
        cookies: cookiesToUnblock,
        block: false
      });

      selectedCookies.clear();
      unblockSelectedBtn.textContent = 'Unblock';
      unblockSelectedBtn.disabled = false;
      loadTabCookies();
    });
  }

  // Filter Buttons
  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      filterButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      filterAndRenderCookies();
    });
  });

  // Search Box Input
  if (cookieSearchInput) {
    cookieSearchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      filterAndRenderCookies();
    });
  }

  // Tracker Sync details
  async function checkTrackerSyncs() {
    try {
      const syncResult = await chrome.runtime.sendMessage({ action: 'detectSyncs' });
      const alertBox = document.getElementById('syncAlert');
      const desc = document.getElementById('syncDesc');
      
      if (syncResult && syncResult.syncs && syncResult.syncs.length > 0) {
        if (alertBox && desc) {
          const companies = syncResult.syncs[0].companies.join(', ');
          desc.textContent = `${companies} are sharing your ID.`;
          alertBox.style.display = 'flex';
        }
      } else {
        if (alertBox) alertBox.style.display = 'none';
      }
    } catch (e) {
      console.warn('Sync detection unavailable.', e);
    }
  }

  // View Switcher (Scanner <-> Rules)
  if (toggleViewBtn) {
    toggleViewBtn.addEventListener('click', () => {
      if (currentView === 'scanner') {
        currentView = 'rules';
        scannerView.style.display = 'none';
        rulesView.style.display = 'flex';
        toggleViewBtn.textContent = '🔍 Scanner';
        renderBlockedList();
      } else {
        currentView = 'scanner';
        rulesView.style.display = 'none';
        scannerView.style.display = 'flex';
        toggleViewBtn.textContent = '🛡️ Rules';
        loadTabCookies();
      }
    });
  }

  // Category Rules Switches Change listeners
  if (blockTrackersRule) {
    blockTrackersRule.addEventListener('change', async () => {
      await chrome.runtime.sendMessage({
        action: 'toggleBlockCategory',
        category: 'tracking',
        block: blockTrackersRule.checked
      });
      // Also sync advertising (Trackers & Ads share this rule)
      await chrome.runtime.sendMessage({
        action: 'toggleBlockCategory',
        category: 'advertising',
        block: blockTrackersRule.checked
      });
      refreshActiveBlocks();
    });
  }

  if (blockAnalyticsRule) {
    blockAnalyticsRule.addEventListener('change', async () => {
      await chrome.runtime.sendMessage({
        action: 'toggleBlockCategory',
        category: 'analytics',
        block: blockAnalyticsRule.checked
      });
      refreshActiveBlocks();
    });
  }

  if (blockUnknownRule) {
    blockUnknownRule.addEventListener('change', async () => {
      await chrome.runtime.sendMessage({
        action: 'toggleBlockCategory',
        category: 'unknown',
        block: blockUnknownRule.checked
      });
      refreshActiveBlocks();
    });
  }

  // Render blocked items in Rules view
  async function renderBlockedList() {
    if (!blockedCookiesList) return;

    const data = await chrome.storage.local.get('blocked_cookies');
    const blocks = data.blocked_cookies || { individual: {}, categories: {}, domains: {} };
    const keys = Object.keys(blocks.individual || {});

    if (keys.length === 0) {
      blockedCookiesList.innerHTML = `<div class="empty-blocked">No individual cookies blocked.</div>`;
      return;
    }

    blockedCookiesList.innerHTML = '';
    keys.forEach(key => {
      const [name, domain] = key.split('::');
      const item = document.createElement('div');
      item.className = 'blocked-list-item';
      item.innerHTML = `
        <div class="blocked-item-info">
          <span class="blocked-item-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
          <span class="blocked-item-domain" title="${escapeHtml(domain)}">${escapeHtml(domain)}</span>
        </div>
        <button class="btn-unblock-item" data-name="${escapeHtml(name)}" data-domain="${escapeHtml(domain)}">Unblock</button>
      `;

      item.querySelector('.btn-unblock-item').addEventListener('click', async (e) => {
        const name = e.target.dataset.name;
        const domain = e.target.dataset.domain;
        
        await chrome.runtime.sendMessage({
          action: 'toggleBlockIndividual',
          name,
          domain,
          block: false
        });
        
        renderBlockedList();
      });

      blockedCookiesList.appendChild(item);
    });
  }

  // Reset all blocks button
  if (resetAllBlocksBtn) {
    resetAllBlocksBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to reset all custom blocking rules?')) {
        await chrome.runtime.sendMessage({ action: 'clearAllBlocks' });
        await refreshActiveBlocks();
        renderBlockedList();
      }
    });
  }

  // Header quick block trackers button
  if (blockTrackersBtn) {
    blockTrackersBtn.addEventListener('click', async () => {
      blockTrackersBtn.textContent = '⏳ Intercepting...';
      blockTrackersBtn.disabled = true;
      try {
        await chrome.runtime.sendMessage({ action: 'blockByCategory', category: 'tracking' });
        await chrome.runtime.sendMessage({ action: 'blockByCategory', category: 'advertising' });
        
        blockTrackersBtn.textContent = '✅ Blocked!';
        setTimeout(() => {
          blockTrackersBtn.textContent = 'Block Trackers';
          blockTrackersBtn.disabled = false;
          loadTabCookies();
        }, 1500);
      } catch (e) {
        blockTrackersBtn.textContent = '❌ Error';
        setTimeout(() => {
          blockTrackersBtn.textContent = 'Block Trackers';
          blockTrackersBtn.disabled = false;
        }, 1500);
      }
    });
  }

  // Export JSON Report button
  if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
      exportBtn.textContent = '⏳ Exporting...';
      try {
        const report = await chrome.runtime.sendMessage({ action: 'exportReport', format: 'json' });
        const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        await chrome.downloads.download({
          url,
          filename: `cookie-autopsy-${siteHostname}-${Date.now()}.json`
        });
        exportBtn.textContent = '✅ Exported';
        setTimeout(() => {
          exportBtn.textContent = 'Export Report';
        }, 1500);
      } catch (e) {
        exportBtn.textContent = '❌ Error';
        setTimeout(() => {
          exportBtn.textContent = 'Export Report';
        }, 1500);
      }
    });
  }

  // Initialize
  loadTabCookies();
});

// Helper: Escape HTML
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}