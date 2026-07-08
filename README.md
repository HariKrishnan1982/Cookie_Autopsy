# 🍪 Cookie Autopsy

A browser extension that translates invisible website cookies into plain English, assigns risk scores, and gives users control over their privacy without breaking websites.

---

## What Problem Does This Solve?

Every website you visit drops **cookies** — small files stored in your browser. Most users have no idea what these cookies actually do:

- `_ga` — Google Analytics tracking your page visits
- `fr` — Facebook following you across 47 websites to show you ads
- `NID` — Google building a profile of your interests

Existing privacy tools either **block everything blindly** (breaking login sessions and shopping carts) or **show raw technical data** that only developers understand.

**Cookie Autopsy is the missing middle ground** — transparency without requiring a computer science degree.

---

## Features

| Feature | Description |
|---------|-------------|
| **🔍 Cookie Scanner** | Reads all cookies set by the current website |
| **📝 Plain English Explanations** | Translates cryptic names like `_ga` into "Tracks which pages you visit to measure site traffic" |
| **🚦 Risk Scoring** | Assigns each cookie a score (0-100) and level: 🔴 High / 🟡 Medium / 🟢 Low |
| **🎯 Block by Purpose** | "Block all ad trackers" instead of blocking entire domains and breaking functionality |
| **📊 Export Reports** | Download JSON reports for GDPR/CCPA compliance audits |
| **🔔 Real-time Notifications** | Toast alerts when high-risk tracking cookies are detected |
| **🔒 Zero Network Calls** | All analysis runs locally — no data leaves your device |

---

## How It Works

```
Website sets a cookie
    ↓
Chrome detects the change via chrome.cookies API
    ↓
Cookie Autopsy matches the name against a signature database
    ↓
Calculates risk score based on:
    • Third-party status (+30)
    • Expiration duration (+5 to +25)
    • Security flags (Secure, HttpOnly, SameSite)
    • Known tracker status (+20 to +25)
    • Data sensitivity (+10)
    ↓
Displays human-readable explanation in popup + toast notification
```

---

## Supported Browsers

| Browser | Status | Notes |
|---------|--------|-------|
| **Google Chrome** | ✅ Supported | Primary development target |
| **Microsoft Edge** | ✅ Supported | Chromium-based, same manifest |
| **Mozilla Firefox** | 🔄 Planned | Requires manifest v2 adapter |
| **Safari** | ❌ Not planned | Requires separate native app |

---

## Installation (Local Development)

### Chrome / Edge

1. Download or clone this repository
2. Add icon files to the `icons/` folder:
   - `icon16.png` (16×16 pixels)
   - `icon48.png` (48×48 pixels)
   - `icon128.png` (128×128 pixels)
3. Navigate to `chrome://extensions/` (Chrome) or `edge://extensions/` (Edge)
4. Enable **Developer mode** (toggle in top-right corner)
5. Click **Load unpacked**
6. Select the `cookie-autopsy` folder
7. The extension icon (🍪) will appear in your toolbar

### Firefox (Coming Soon)

Firefox requires Manifest V2 adaptation. A compatible version will be released in a future update.

---

## Testing Guide

| Website | Expected Result | What to Check |
|---------|----------------|---------------|
| `google.com` | Multiple analytics cookies | Look for `_ga`, `NID` — medium to high risk |
| `facebook.com` | Heavy tracking | `fr`, `datr` — 🔴 high risk, cross-site tracking |
| `amazon.com` | Essential + advertising mix | Shopping cart cookies 🟢, ad cookies 🟡 |
| `github.com` | Minimal cookies | Mostly essential session cookies 🟢 |
| `news site` (CNN, BBC, etc.) | High tracker count | Multiple ad networks, analytics tools |

**Interactive Tests:**
1. Click the 🍪 icon on any website → view the cookie dashboard
2. Click filter buttons (All / Essential / Analytics / Ads / Tracking)
3. Click a cookie row → expand to see security details and risk reasons
4. Click **"Block All Trackers"** → trackers removed, page refresh to verify
5. Click **"Export"** → download JSON report

---

## File Structure

```
cookie-autopsy/
├── manifest.json              # Extension configuration (Manifest V3)
├── background.js              # Service worker — core engine
│   ├── Cookie signature database (inlined)
│   ├── Classifier (matches cookie names to explanations)
│   ├── Risk scorer (calculates 0-100 danger score)
│   ├── Badge updater (shows high-risk count on icon)
│   ├── Cookie blocker (removes by category)
│   └── Report generator (exports JSON)
├── popup.html                 # Extension popup markup
├── popup.css                  # Popup styling (dark theme)
├── popup.js                   # Popup logic — fetches and displays cookies
├── content.js                 # Injected script — toast notifications
└── icons/
    ├── icon16.png             # Toolbar icon
    ├── icon48.png             # Extension page icon
    └── icon128.png            # Chrome Web Store icon
```

---

## Architecture

### Cookie Classification Pipeline

```javascript
Raw Cookie: { name: "_ga", domain: ".google.com", ... }
    ↓
Pattern Match: "_ga" matches Google Analytics signature
    ↓
Domain Inference: google-analytics.com → known tracker
    ↓
Heuristic Analysis: _hj* pattern → Hotjar analytics
    ↓
Unknown Fallback: Flag for community submission
    ↓
Classification: { company: "Google", product: "Analytics", category: "analytics" }
```

### Risk Scoring Algorithm (0-100)

| Factor | Points | Trigger |
|--------|--------|---------|
| Third-party cookie | +30 | `hostOnly: false` |
| Expires >2 years | +25 | Long-term tracking profile |
| Expires >1 year | +15 | Extended tracking |
| Expires >30 days | +5 | Persistent cookie |
| Not Secure flag | +15 | Can be stolen on HTTP |
| Not HttpOnly | +10 | JavaScript accessible |
| SameSite=None | +20 | Cross-site by default |
| SameSite unspecified | +5 | Legacy behavior |
| Known tracker | +25 | Category: "tracking" |
| Known advertising | +20 | Category: "advertising" |
| Analytics | +5 | Category: "analytics" |
| Sensitive data | +10 | Collects location, purchases, etc. |
| Cross-site design | +10 | `crossSite: true` |

**Risk Levels:**
- **0–29:** 🟢 Low — Essential functionality, minimal privacy impact
- **30–59:** 🟡 Medium — Analytics or moderate tracking
- **60–100:** 🔴 High — Cross-site tracking, ad targeting, sensitive data collection

---

## Privacy & Security

| Principle | Implementation |
|-----------|---------------|
| **Local-Only Analysis** | All cookie classification and risk scoring runs in the browser. No network requests. |
| **No Data Collection** | We do not collect, store, or transmit user data. |
| **No Remote Code** | Manifest V3 prohibits remote-hosted code. All logic is bundled. |
| **Open Source** | Full source code is auditable. No hidden tracking. |
| **Permission Minimalism** | Only requests permissions strictly necessary for functionality. |

---

## Roadmap

| Phase | Feature | Status |
|-------|---------|--------|
| **v1.0** | Core cookie scanning + risk scoring | ✅ In Progress |
| **v1.1** | Community cookie submission system | 🔄 Planned |
| **v1.2** | Firefox Manifest V2 port | 🔄 Planned |
| **v1.3** | Cookie sync detection ("5 companies share your ID") | 🔄 Planned |
| **v2.0** | GDPR/CCPA auto-report generator (PDF) | 📋 Backlog |
| **v2.1** | Paid business tier ($9/month) | 📋 Backlog |
| **v2.2** | Machine learning for unknown cookie classification | 📋 Backlog |

---

## Team

| Role | Responsibilities |
|------|----------------|
| **Security Architect** | Browser extension engine, `chrome.cookies` API integration, risk scoring algorithm, security audit |
| **Frontend Developer** | UI/UX design, popup interface, toast notifications, cookie database research, community features |

---

## Contributing

We welcome contributions, especially:

1. **Cookie Signatures** — Research and document unknown cookies
2. **Translations** — Localize explanations for non-English users
3. **Browser Ports** — Firefox, Safari adaptations
4. **Bug Reports** — Test on real websites and report inaccuracies

To contribute:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

MIT License — Free to use, modify, and distribute. Attribution appreciated.

```
Copyright (c) 2026 Cookie Autopsy Team

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
```

---

## Disclaimer

This extension is provided for **educational and privacy awareness purposes only**. It does not hack, exploit, or otherwise compromise any website. It merely reads cookies that are already stored in the user's browser and presents them in a human-readable format.

**No warranty is provided.** Use at your own risk. Always verify compliance requirements with legal counsel.

---

**Built with transparency, privacy, and a refusal to accept that users shouldn't understand what happens in their own browser.**

*"Privacy is not a privilege. It is a right."*
