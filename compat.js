/**
 * compat.js — Browser API Compatibility Shim
 *
 * Normalizes the `chrome` and `browser` namespace differences so this
 * extension works on both Chromium-based browsers and Firefox (MV3, ≥128).
 *
 * Firefox MV3 (≥109) exposes a `chrome.*` alias that mirrors the callback-
 * based Chrome API surface. This shim is a safety net for environments where
 * that alias is missing or limited, and it patches browser-specific URLs.
 */
(function () {
  'use strict';

  // Ensure `chrome` always resolves to the extension API object.
  // In Firefox MV3 ≥109 this is a no-op (chrome is already defined).
  // Kept as a defensive fallback for future/edge environments.
  if (typeof globalThis !== 'undefined') {
    if (typeof globalThis.chrome === 'undefined' && typeof globalThis.browser !== 'undefined') {
      globalThis.chrome = globalThis.browser;
    }
  }

  // Detect Firefox by checking for the mozilla-specific runtime property.
  const isFirefox = typeof browser !== 'undefined' &&
    typeof browser.runtime !== 'undefined' &&
    Object.prototype.toString.call(browser.runtime) === '[object Object]' &&
    typeof browser.runtime.getBrowserInfo === 'function';

  if (typeof globalThis !== 'undefined') {
    globalThis.__extIsFirefox = isFirefox;
  }
})();
