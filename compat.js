/**
 * compat.js — Browser API Compatibility Shim
 *
 * Normalizes the `chrome` and `browser` namespace differences so this
 * extension works across Chromium-based browsers (Chrome, Edge, Brave, Kiwi)
 * and Firefox (MV3, >=128) with uniform callback and Promise support.
 */
(function () {
  'use strict';

  const root = typeof globalThis !== 'undefined'
    ? globalThis
    : (typeof window !== 'undefined' ? window : this);

  // Normalize chrome / browser root aliases
  if (typeof root.chrome === 'undefined' && typeof root.browser !== 'undefined') {
    root.chrome = root.browser;
  } else if (typeof root.browser === 'undefined' && typeof root.chrome !== 'undefined') {
    root.browser = root.chrome;
  }

  // Detect Firefox environment
  const isFirefox = typeof root.browser !== 'undefined' &&
    typeof root.browser.runtime !== 'undefined' &&
    (typeof root.browser.runtime.getBrowserInfo === 'function' ||
     (typeof navigator !== 'undefined' && /firefox|fxios/i.test(navigator.userAgent)));

  root.__extIsFirefox = isFirefox;

  // Universal Promise-based wrapper for storage and runtime messaging
  root.__extCompat = {
    /**
     * Safe asynchronous storage get helper.
     * @param {string|string[]|Object} keys
     * @param {'local'|'session'|'sync'} area
     * @returns {Promise<Object>}
     */
    storageGet(keys, area = 'local') {
      return new Promise((resolve) => {
        try {
          const storageArea = root.chrome?.storage?.[area] || root.browser?.storage?.[area];
          if (!storageArea) return resolve({});
          const res = storageArea.get(keys, (data) => {
            if (root.chrome?.runtime?.lastError) {
              resolve({});
            } else {
              resolve(data || {});
            }
          });
          if (res instanceof Promise) {
            res.then(resolve).catch(() => resolve({}));
          }
        } catch (_) {
          resolve({});
        }
      });
    },

    /**
     * Safe asynchronous storage set helper.
     * @param {Object} items
     * @param {'local'|'session'|'sync'} area
     * @returns {Promise<void>}
     */
    storageSet(items, area = 'local') {
      return new Promise((resolve, reject) => {
        try {
          const storageArea = root.chrome?.storage?.[area] || root.browser?.storage?.[area];
          if (!storageArea) return resolve();
          const res = storageArea.set(items, () => {
            if (root.chrome?.runtime?.lastError) {
              reject(new Error(root.chrome.runtime.lastError.message));
            } else {
              resolve();
            }
          });
          if (res instanceof Promise) {
            res.then(resolve).catch(reject);
          }
        } catch (err) {
          reject(err);
        }
      });
    },

    /**
     * Safe asynchronous runtime message helper.
     * @param {Object} msg
     * @returns {Promise<any>}
     */
    sendMessage(msg) {
      return new Promise((resolve) => {
        try {
          const runtime = root.chrome?.runtime || root.browser?.runtime;
          if (!runtime || !runtime.sendMessage) return resolve({ ok: false });
          const res = runtime.sendMessage(msg, (response) => {
            void root.chrome?.runtime?.lastError;
            resolve(response || { ok: false });
          });
          if (res instanceof Promise) {
            res.then(resolve).catch(() => resolve({ ok: false }));
          }
        } catch (_) {
          resolve({ ok: false });
        }
      });
    }
  };
})();
