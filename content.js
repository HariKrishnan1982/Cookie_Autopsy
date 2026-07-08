// content.js
// Injected into every webpage — shows toast notifications for cookie events

// Prevent duplicate toasts
let toastTimeout = null;
let toastCount = 0;
const MAX_TOASTS_PER_MINUTE = 5;

// Listen for messages from background.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'cookieEvent') {
    showToast(message);
  }
  // Always return true for async, but we don't need it here
  return true;
});

function showToast({ classification, risk, removed, domain }) {
  // Rate limit — don't spam the user
  if (toastCount >= MAX_TOASTS_PER_MINUTE) return;
  
  if (toastTimeout) {
    clearTimeout(toastTimeout);
  }
  toastTimeout = setTimeout(() => {
    toastCount = 0;
  }, 60000);
  toastCount++;
  
  // Only show toasts for high-risk tracking cookies
  if (risk.level !== 'high') return;
  
  // Create toast element
  const toast = document.createElement('div');
  toast.id = 'cookie-autopsy-toast';
  
  // Style it
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%);
    color: #fef2f2;
    padding: 14px 18px;
    border-radius: 12px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    max-width: 340px;
    z-index: 2147483647;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    border: 1px solid rgba(255,255,255,0.1);
    animation: cookieAutopsySlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    line-height: 1.5;
    cursor: pointer;
  `;
  
  const action = removed ? 'removed' : 'detected';
  const emoji = removed ? '🗑️' : '🔴';
  
  toast.innerHTML = `
    <div style="display: flex; align-items: start; gap: 10px;">
      <span style="font-size: 20px; flex-shrink: 0;">${emoji}</span>
      <div style="flex: 1;">
        <div style="font-weight: 700; margin-bottom: 3px; font-size: 14px;">
          Tracker ${action}
        </div>
        <div style="opacity: 0.9; margin-bottom: 4px;">
          <strong>${classification.company}</strong> ${classification.product}
        </div>
        <div style="opacity: 0.75; font-size: 12px; line-height: 1.4;">
          ${classification.description.substring(0, 120)}${classification.description.length > 120 ? '...' : ''}
        </div>
        <div style="margin-top: 8px; font-size: 11px; opacity: 0.6; display: flex; gap: 8px; align-items: center;">
          <span>⚠️ Risk: ${risk.level.toUpperCase()}</span>
          <span>·</span>
          <span>🌐 ${domain.replace(/^\./, '')}</span>
        </div>
      </div>
      <button id="cat-close-toast" style="background: none; border: none; color: rgba(255,255,255,0.5); cursor: pointer; font-size: 18px; padding: 0; line-height: 1; flex-shrink: 0;">×</button>
    </div>
  `;
  
  // Add animation styles (only once)
  if (!document.getElementById('cookie-autopsy-styles')) {
    const style = document.createElement('style');
    style.id = 'cookie-autopsy-styles';
    style.textContent = `
      @keyframes cookieAutopsySlideIn {
        from { transform: translateX(120%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes cookieAutopsySlideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(120%); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }
  
  // Remove existing toast if any
  const existing = document.getElementById('cookie-autopsy-toast');
  if (existing) existing.remove();
  
  // Add to page
  document.body.appendChild(toast);
  
  // Close button
  toast.querySelector('#cat-close-toast').addEventListener('click', (e) => {
    e.stopPropagation();
    removeToast(toast);
  });
  
  // Click toast to open extension popup
  toast.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'openPopup' });
    removeToast(toast);
  });
  
  // Auto-remove after 6 seconds
  setTimeout(() => removeToast(toast), 6000);
}

function removeToast(toast) {
  if (!toast || !toast.parentNode) return;
  toast.style.animation = 'cookieAutopsySlideOut 0.3s ease forwards';
  setTimeout(() => toast.remove(), 300);
}

// Also listen for our own cookie changes via page JavaScript
// (This catches cookies set by JavaScript that chrome.cookies API might miss)
if (window.cookieAutopsyObserver) {
  window.cookieAutopsyObserver.disconnect();
}

const observer = new MutationObserver(() => {
  // Check if document.cookie changed
  // This is a lightweight check — the background.js handles the real work
});

window.cookieAutopsyObserver = observer;