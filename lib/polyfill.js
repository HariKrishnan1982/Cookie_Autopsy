// lib/polyfill.js
// Makes 'chrome' APIs available in Firefox (which uses 'browser')
if (typeof browser !== 'undefined') {
  window.chrome = browser;
}