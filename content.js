/**
 * content.js â€” Runs in MAIN world at document_start
 *
 * Overrides navigator.geolocation using spoofed coordinates.
 * Config is received via:
 *   1. Initial handshake from storage-bridge.js (ISOLATED world companion)
 *   2. Live updates via per-install CustomEvent '__gps_sync_res_{token}'
 *   3. Background service worker broadcasts (via scripting.executeScript)
 *
 * Stealth Level: Maximum
 *   - Native function caching at script start (defeats DOM spy hooks loaded late)
 *   - Function.prototype.toString cloaking (defeats prototype integrity checks)
 *   - Sensor fusion spoofing via DeviceMotion/DeviceOrientation
 *   - Per-install randomized bridge event names (defeats signature matching)
 *   - Device accuracy profiles (defeats static telemetry fingerprinting)
 */

(function () {
  'use strict';

  // Fast bail-out on private internal infrastructure IPs (e.g. Proxmox, router, NAS)
  const host = window.location.hostname;
  if (/^(?:10\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)/.test(host)) {
    return;
  }

  // Phase 1: Native Function Caching
  const _addEventListener    = window.addEventListener.bind(window);
  const _removeEventListener = window.removeEventListener.bind(window);
  const _dispatchEvent       = window.dispatchEvent.bind(window);
  const _CustomEvent         = CustomEvent;
  const _setTimeout          = setTimeout;
  const _setInterval         = setInterval;
  const _clearInterval       = clearInterval;
  const _origFetch           = window.fetch ? window.fetch.bind(window) : null;

  const _geoProto               = Geolocation.prototype;
  const _origGetCurrentPosition = _geoProto.getCurrentPosition;
  const _origWatchPosition      = _geoProto.watchPosition;
  const _origClearWatch         = _geoProto.clearWatch;

  // ── Phase 2: .toString() Cloaking ──────────────────────────────────────────
  const _origFnToString = Function.prototype.toString;
  const _nativeStringMap = new Map();

  let _inToString = false;
  const _toStringProxy = new Proxy(_origFnToString, {
    apply(target, thisArg, args) {
      if (thisArg === _toStringProxy || thisArg === _origFnToString) {
        return 'function toString() { [native code] }';
      }
      if (_inToString) {
        return Reflect.apply(target, thisArg, args);
      }
      _inToString = true;
      try {
        if (_nativeStringMap.has(thisArg)) {
          return _nativeStringMap.get(thisArg);
        }
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

  //  Secure Configuration State 
  let currentConfig = null;
  const _fakeWatchIds  = new Set();
  const watchIntervals = new Map();
  const activeDrifts   = new Map();

  //  Accuracy Profile Definitions â”€
  // Each profile maps to realistic sensor ranges for a given device scenario.
  const ACCURACY_PROFILES = {
    mobile_gps: {
      accuracyMin:         4,   accuracyMax:         10,
      altAccuracyMin:      6,   altAccuracyMax:      12,
      altitudeM:           7.5, altitudeDelta:        1.2,
    },
    desktop: {
      accuracyMin:         20,  accuracyMax:         40,
      altAccuracyMin:      25,  altAccuracyMax:      50,
      altitudeM:           10,  altitudeDelta:        3,
    },
    low_signal: {
      accuracyMin:         50,  accuracyMax:         120,
      altAccuracyMin:      60,  altAccuracyMax:      150,
      altitudeM:           7.5, altitudeDelta:        5,
    },
  };

  function getProfile() {
    const key = (currentConfig && currentConfig.profile) || 'mobile_gps';
    return ACCURACY_PROFILES[key] || ACCURACY_PROFILES.mobile_gps;
  }

  // Diagnostic whitelist for safe verification without breaking normal sites
  const DIAGNOSTIC_DOMAINS = [
    'browserleaks.com',
    'html5demos.com',
    'my-location.org',
    'w3schools.com',
    'where-am-i.org',
    'localhost',
    '127.0.0.1',
    'mia.its.ac.id'
  ];

  function isDomainAllowed(hostname, targetDomain, testMode) {
    if (testMode === true) return true;
    if (!hostname) return false;
    if (hostname === targetDomain) return true;
    for (let i = 0; i < DIAGNOSTIC_DOMAINS.length; i++) {
      const d = DIAGNOSTIC_DOMAINS[i];
      if (hostname === d || hostname.endsWith('.' + d)) return true;
    }
    return false;
  }

  function getSpoofConfig() {
    if (!currentConfig) return null;
    const targetDomain = currentConfig.targetDomain || 'mia.its.ac.id';
    if (!isDomainAllowed(window.location.hostname, targetDomain, currentConfig.testMode)) return null;
    if (currentConfig.enabled && currentConfig.lat !== null && currentConfig.lng !== null) {
      return currentConfig;
    }
    return null;
  }

  //  Position Builders â”€
  function coordJitter() {
    const u = 1 - Math.random();
    const v = 1 - Math.random();
    const n = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return n * 0.000015;
  }

  function buildPosition(lat, lng) {
    const p = getProfile();
    const accuracy         = p.accuracyMin + Math.random() * (p.accuracyMax - p.accuracyMin);
    const altitudeAccuracy = p.altAccuracyMin + Math.random() * (p.altAccuracyMax - p.altAccuracyMin);
    const altitude         = p.altitudeM + (Math.random() * p.altitudeDelta * 2 - p.altitudeDelta);

    return {
      coords: {
        latitude:         parseFloat(lat) + coordJitter(),
        longitude:        parseFloat(lng) + coordJitter(),
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
    return 400 + Math.random() * 800;
  }

  function simulateKineticDrift(baseLat, baseLng, watchId) {
    if (!activeDrifts.has(watchId)) {
      activeDrifts.set(watchId, { lat: parseFloat(baseLat), lng: parseFloat(baseLng) });
    }
    const current = activeDrifts.get(watchId);
    current.lat += (Math.random() - 0.5) * 0.00002;
    current.lng += (Math.random() - 0.5) * 0.00002;

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

  // ── Telemetry Helper (MAIN world -> storage-bridge.js) ───────────────────
  function _sendSubmitTelemetry(lat, lng) {
    try {
      const payload = {
        type:    'PRESENSI_SUBMIT',
        lat:     String(lat),
        lng:     String(lng),
        profile: (currentConfig && currentConfig.profile) || 'mobile_gps',
        ts:      Date.now()
      };
      _dispatchEvent(new _CustomEvent('__gps_telemetry_msg', { detail: JSON.stringify(payload) }));
    } catch (_) {}
  }

  let _resultSent = false;
  function _sendResultTelemetry(status) {
    if (_resultSent) return;
    _resultSent = true;
    try {
      const payload = {
        type:   'PRESENSI_RESULT',
        status,
        ts:     Date.now()
      };
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
          const pos = buildPosition(cfg.lat, cfg.lng);
          if (typeof successCallback === 'function') {
            successCallback(pos);
          }
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

  // Permissions API cloaking (mocking query state to 'granted')
  if (navigator.permissions && typeof navigator.permissions.query === 'function') {
    const _origPermissionsQuery = navigator.permissions.query.bind(navigator.permissions);
    const permissionsQueryProxy = new Proxy(_origPermissionsQuery, {
      apply(target, thisArg, args) {
        const [descriptor] = args;
        if (descriptor && descriptor.name === 'geolocation' && getSpoofConfig()) {
          const fakeStatus = {
            state: 'granted',
            name: 'geolocation',
            onchange: null,
            addEventListener: function() {},
            removeEventListener: function() {},
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
    try {
      navigator.permissions.query = permissionsQueryProxy;
    } catch (_) {}
  }

  // --- Device Spoofing (Navigator properties) ---
  function applyDeviceSpoofing(deviceMode) {
    if (!deviceMode || deviceMode === 'desktop') return;

    let vendor = '';
    let platform = '';
    let touch = 0;

    if (deviceMode === 'android') {
      vendor = 'Google Inc.';
      platform = 'Linux armv8l';
      touch = 5;
    } else if (deviceMode === 'ios') {
      vendor = 'Apple Computer, Inc.';
      platform = 'iPhone';
      touch = 5;
    }

    try {
      if (vendor)   Object.defineProperty(navigator, 'vendor', { get: () => vendor });
      if (platform) Object.defineProperty(navigator, 'platform', { get: () => platform });
      if (touch)    Object.defineProperty(navigator, 'maxTouchPoints', { get: () => touch });
    } catch (_) {}
  }

  // ── Phase 2.5: Maximum Stealth Anti-Fingerprinting Suite ──────────────────

  // 1. Timezone Lock: Asia/Jakarta (WIB, UTC+7)
  const _origGetTimezoneOffset = Date.prototype.getTimezoneOffset;
  const _tzOffsetProxy = new Proxy(_origGetTimezoneOffset, {
    apply(target, thisArg, args) {
      if (getSpoofConfig()) {
        return -420; // UTC+7 (Surabaya / WIB offset in minutes is -420)
      }
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
        if (getSpoofConfig()) {
          return Object.assign({}, opts, { timeZone: 'Asia/Jakarta' });
        }
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
                  // Strip private RFC1918 LAN IPs
                  if (/(?:10\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)/.test(c)) {
                    return;
                  }
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
                      if (/(?:10\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)/.test(c)) {
                        return;
                      }
                    }
                    return fn.apply(this, arguments);
                  };
                } else {
                  _customIceHandler = fn;
                }
              },
              configurable: true,
              enumerable: true
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

  // 3. Canvas & WebGL Micro-Noise Protection
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
          if (param === 37445) { // UNMASKED_VENDOR_WEBGL
            return cfg.deviceMode === 'ios' ? 'Apple Inc.' : 'Google Inc. (NVIDIA)';
          }
          if (param === 37446) { // UNMASKED_RENDERER_WEBGL
            return cfg.deviceMode === 'ios' ? 'Apple GPU' : 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)';
          }
        }
        return Reflect.apply(target, thisArg, args);
      }
    });
    _cloak(getParamProxy, 'function getParameter() { [native code] }');
    try { proto.getParameter = getParamProxy; } catch (_) {}
  }
  if (window.WebGLRenderingContext) _patchWebGLContext(WebGLRenderingContext.prototype);
  if (window.WebGL2RenderingContext) _patchWebGLContext(WebGL2RenderingContext.prototype);

  // 4. Hardware Concurrency, Device Memory & Battery API Mocking
  try {
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: () => {
        const cfg = getSpoofConfig();
        if (cfg && (cfg.deviceMode === 'android' || cfg.deviceMode === 'ios')) return 4;
        return 8;
      },
      configurable: true
    });
    Object.defineProperty(navigator, 'deviceMemory', {
      get: () => 8,
      configurable: true
    });
  } catch (_) {}

  if (navigator.getBattery) {
    const _origGetBattery = navigator.getBattery.bind(navigator);
    const getBatteryProxy = new Proxy(_origGetBattery, {
      apply(target, thisArg, args) {
        if (getSpoofConfig()) {
          const fakeBattery = {
            charging: true,
            chargingTime: 0,
            dischargingTime: Infinity,
            level: 0.88,
            onchargingchange: null,
            onchargingtimechange: null,
            ondischargingtimechange: null,
            onlevelchange: null,
            addEventListener: function() {},
            removeEventListener: function() {},
            dispatchEvent: function() { return true; }
          };
          return Promise.resolve(fakeBattery);
        }
        return Reflect.apply(target, thisArg, args);
      }
    });
    _cloak(getBatteryProxy, 'function getBattery() { [native code] }');
    try { navigator.getBattery = getBatteryProxy; } catch (_) {}
  }

  // ── Phase 2.6: Virtual Camera & Attendance QR Injector ────────────────────
  let _virtualQrImage = null; // Stored Image element or data URL when injected

  function setVirtualQrImage(src) {
    if (!src) {
      _virtualQrImage = null;
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { _virtualQrImage = img; };
    img.src = src;
  }

  function _createSyntheticQrStream(img) {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');

    function drawFrame() {
      if (!_virtualQrImage) return;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const aspect = img.width / img.height;
      let drawW = canvas.width * 0.7;
      let drawH = drawW / aspect;
      if (drawH > canvas.height * 0.7) {
        drawH = canvas.height * 0.7;
        drawW = drawH * aspect;
      }
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

  //  Phase 3: Sensor Fusion Spoofing â”€
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
        alpha:    orientationData.alpha,
        beta:     orientationData.beta,
        gamma:    orientationData.gamma,
        absolute: orientationData.absolute,
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

  // Phase 4: Dynamic Bridge Handshake
  // --- Dynamic Bridge Handshake ---
  // We generate a random session token. This ensures that even if the page guesses the request event name,
  // it cannot guess the response event name.
  const sessionToken = Math.random().toString(36).substring(2, 15);
  const reqEvent = '__gps_sync_req';
  const resEvent = '__gps_sync_res_' + sessionToken;

  // Listen for config responses from ISOLATED world bridge
  // Use capture phase (true) to intercept the event before page scripts see it.
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
          // If enabled, apply the device spoofing to navigator
          applyDeviceSpoofing(currentConfig.deviceMode);
        }
      } catch (_) {}
    }
  }, true);

  // Request the initial config, passing our secure session token as a primitive string
  // to avoid Firefox Xray wrapper object cloning issues.
  // Uses bounded retries with backoff to prevent infinite event loops.
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

  // ── Auto-Room Matching Presets & Detector ─────────────────────────────────
  const CAMPUS_ROOM_PRESETS = [
    { regex: /\b(?:TW1|TOWER\s*1)\b/i,                        lat: -7.2849915,         lng: 112.793897,         label: 'Tower 1' },
    { regex: /\b(?:TW2|TOWER\s*2)\b/i,                        lat: -7.2852792,         lng: 112.7952975,        label: 'Tower 2' },
    { regex: /\b(?:KORIDC|KORIDOR\s*C|CLASS\s*C|KORIDOR)\b/i, lat: -7.284793988582386, lng: 112.79570676550246, label: 'Koridor C' },
  ];

  function detectRoomPreset(roomString) {
    if (!roomString || typeof roomString !== 'string') return null;
    for (let i = 0; i < CAMPUS_ROOM_PRESETS.length; i++) {
      if (CAMPUS_ROOM_PRESETS[i].regex.test(roomString)) {
        return CAMPUS_ROOM_PRESETS[i];
      }
    }
    // Check dynamic custom presets configured by user
    if (currentConfig && Array.isArray(currentConfig.customPresets)) {
      for (let j = 0; j < currentConfig.customPresets.length; j++) {
        const cp = currentConfig.customPresets[j];
        if (!cp || cp.lat == null || cp.lng == null) continue;
        if (cp.regex) {
          try {
            const rx = new RegExp(cp.regex, 'i');
            if (rx.test(roomString)) {
              return { lat: cp.lat, lng: cp.lng, label: cp.name || 'Custom Preset' };
            }
          } catch (_) {}
        } else if (cp.name) {
          try {
            const escaped = cp.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const rx = new RegExp('\\b' + escaped + '\\b', 'i');
            if (rx.test(roomString)) {
              return { lat: cp.lat, lng: cp.lng, label: cp.name };
            }
          } catch (_) {}
        }
      }
    }
    return null;
  }

  // Auto-refresh config on tab wake-up or network reconnection
  _addEventListener('pageshow', () => {
    configReceived = false;
    retries = 0;
    requestConfig();
  });
  _addEventListener('online', () => {
    configReceived = false;
    retries = 0;
    requestConfig();
  });

  // ── Phase 4.5: Network Interceptor, Response Sniffer & Live HUD ────────────
  let _hudContainer = null;
  let _hudInterval = null;
  let _activeMeetingData = null;

  function _formatCountdown(seconds) {
    if (seconds <= 0) return '00:00 (EXPIRED)';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  function _createOrUpdateHud(info) {
    if (!info || (!info.tm_mulai && info.status !== 'sedang_berlangsung')) return;
    const host = window.location.hostname;
    const targetDomain = (currentConfig && currentConfig.targetDomain) || 'mia.its.ac.id';
    if (host !== targetDomain && !host.endsWith('.' + targetDomain) && host !== 'mia.its.ac.id' && !host.endsWith('.its.ac.id')) {
      return;
    }
    _activeMeetingData = info;

    if (!_hudContainer) {
      if (!document.body) {
        document.addEventListener('DOMContentLoaded', () => _createOrUpdateHud(info), { once: true });
        return;
      }
      _hudContainer = document.createElement('div');
      _hudContainer.id = 'mia-presensi-hud';
      _hudContainer.setAttribute('data-extension', 'presensi-hud');

      const style = document.createElement('style');
      style.textContent = `
        #mia-presensi-hud {
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
        #mia-presensi-hud.minimized {
          padding: 8px 12px;
          min-width: auto;
          cursor: pointer;
        }
        #mia-presensi-hud .hud-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-weight: 600;
          font-size: 12px;
          margin-bottom: 6px;
          color: #60a5fa;
        }
        #mia-presensi-hud.minimized .hud-body { display: none; }
        #mia-presensi-hud:not(.minimized) .hud-min-view { display: none; }
        #mia-presensi-hud .hud-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 8px;
          border-radius: 6px;
          font-weight: 600;
          font-size: 13px;
          margin-top: 4px;
        }
        #mia-presensi-hud .hud-pill.green { background: rgba(34, 197, 94, 0.2); color: #4ade80; }
        #mia-presensi-hud .hud-pill.yellow { background: rgba(234, 179, 8, 0.2); color: #facc15; }
        #mia-presensi-hud .hud-pill.red { background: rgba(239, 68, 68, 0.25); color: #f87171; }
        #mia-presensi-hud .hud-sub {
          color: #9ca3af;
          font-size: 11px;
          margin-top: 4px;
        }
        #mia-presensi-hud .hud-btn-toggle {
          background: transparent;
          border: none;
          color: #9ca3af;
          cursor: pointer;
          padding: 2px 4px;
          font-size: 11px;
        }
        #mia-presensi-hud .hud-btn-toggle:hover { color: #fff; }
        #mia-presensi-hud .hud-room-badge {
          display: inline-block;
          font-size: 11px;
          color: #60a5fa;
          background: rgba(96, 165, 250, 0.15);
          border: 1px solid rgba(96, 165, 250, 0.3);
          border-radius: 4px;
          padding: 2px 6px;
          margin-top: 5px;
        }
        #mia-presensi-hud .hud-action-row {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 8px;
        }
        #mia-presensi-hud .hud-code-input {
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
        #mia-presensi-hud .hud-code-input:focus {
          border-color: #60a5fa;
          box-shadow: 0 0 0 1px #60a5fa;
        }
        #mia-presensi-hud .hud-btn-checkin {
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
        #mia-presensi-hud .hud-btn-checkin:hover {
          background: #1d4ed8;
        }
        #mia-presensi-hud .hud-btn-checkin:active {
          background: #1e40af;
        }
        #mia-presensi-hud .hud-status-msg {
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
            <span>myITS Attendance Monitor</span>
            <button class="hud-btn-toggle" title="Minimize">—</button>
          </div>
          <div class="hud-title" style="font-weight:600;color:#fff;">Active Class</div>
          <div class="hud-pill green">⏳ --:--</div>
          <div class="hud-rule hud-sub">Tracking session...</div>
          <div class="hud-room-badge" style="display:none;"></div>
          <div class="hud-action-row">
            <input type="text" maxlength="6" class="hud-code-input" placeholder="Kode OTP" title="Masukkan 6-digit kode presensi" />
            <button class="hud-btn-checkin">Hadir</button>
            <button class="hud-btn-qr" title="Inject QR Code Image" style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:#fff;border-radius:6px;padding:6px 8px;cursor:pointer;font-size:11px;">📷 QR</button>
            <input type="file" class="hud-qr-file" accept="image/*" style="display:none;" />
          </div>
          <div class="hud-status-msg"></div>
          <div class="hud-sub" style="border-top:1px dashed rgba(255,255,255,0.1);padding-top:4px;margin-top:6px;">
            GPS Spoof: <span class="hud-spoof-status">Active</span>
          </div>
        </div>
      `;

      _hudContainer._refs = {
        minTimer: _hudContainer.querySelector('.hud-min-timer'),
        title: _hudContainer.querySelector('.hud-title'),
        pill: _hudContainer.querySelector('.hud-pill'),
        rule: _hudContainer.querySelector('.hud-rule'),
        spoof: _hudContainer.querySelector('.hud-spoof-status'),
        roomBadge: _hudContainer.querySelector('.hud-room-badge'),
        codeInput: _hudContainer.querySelector('.hud-code-input'),
        btnCheckin: _hudContainer.querySelector('.hud-btn-checkin'),
        btnQr: _hudContainer.querySelector('.hud-btn-qr'),
        fileQr: _hudContainer.querySelector('.hud-qr-file'),
        statusMsg: _hudContainer.querySelector('.hud-status-msg'),
      };

      document.body.appendChild(_hudContainer);

      _hudContainer.addEventListener('click', (e) => {
        if (e.target.closest('.hud-btn-toggle') || _hudContainer.classList.contains('minimized')) {
          _hudContainer.classList.toggle('minimized');
        }
      });

      const codeInput = _hudContainer._refs.codeInput;
      const btnCheckin = _hudContainer._refs.btnCheckin;
      const btnQr = _hudContainer._refs.btnQr;
      const fileQr = _hudContainer._refs.fileQr;

      codeInput.addEventListener('click', (e) => e.stopPropagation());
      codeInput.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') _triggerCheckIn();
      });

      btnCheckin.addEventListener('click', (e) => {
        e.stopPropagation();
        _triggerCheckIn();
      });

      if (btnQr && fileQr) {
        btnQr.addEventListener('click', (e) => {
          e.stopPropagation();
          fileQr.click();
        });
        fileQr.addEventListener('change', (e) => {
          e.stopPropagation();
          const file = e.target.files && e.target.files[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (revt) => {
              setVirtualQrImage(revt.target.result);
              if (_hudContainer._refs.statusMsg) {
                _hudContainer._refs.statusMsg.textContent = '📷 QR loaded to Virtual Cam!';
                _hudContainer._refs.statusMsg.style.color = '#38bdf8';
              }
            };
            reader.readAsDataURL(file);
          }
        });
      }
    }

    if (!_hudInterval) {
      _hudInterval = _setInterval(_renderHudTick, 1000);
    }
    _renderHudTick();
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

    if (refs.statusMsg) {
      refs.statusMsg.textContent = 'Memproses presensi...';
      refs.statusMsg.style.color = '#60a5fa';
    }
    refs.btnCheckin.disabled = true;
    refs.btnCheckin.style.opacity = '0.6';

    const tmId = (_activeMeetingData && (_activeMeetingData.id_tatap_muka || _activeMeetingData.id_tm || _activeMeetingData.id)) || null;
    const cfg = getSpoofConfig();
    const pos = cfg ? buildPosition(cfg.lat, cfg.lng) : { coords: { latitude: -7.287123, longitude: 112.798542 } };

    let apiSuccess = false;

    // 1. Direct API submission if tmId known
    if (tmId && _origFetch) {
      try {
        const payload = {
          jenis_hadir_tm: 'L',
          kode: code,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude
        };
        const res = await _origFetch(`/api/presensi/tm/${tmId}/mahasiswa/self`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          apiSuccess = true;
          if (refs.statusMsg) {
            refs.statusMsg.textContent = '✓ Presensi berhasil!';
            refs.statusMsg.style.color = '#4ade80';
          }
          _sendSubmitTelemetry(pos.coords.latitude, pos.coords.longitude);
          _sendResultTelemetry('accepted');
        } else {
          const errData = await res.json().catch(() => ({}));
          const errMsg = errData.message || `Gagal HTTP ${res.status}`;
          if (refs.statusMsg) {
            refs.statusMsg.textContent = `✕ ${errMsg}`;
            refs.statusMsg.style.color = '#f87171';
          }
        }
      } catch (_) {}
    }

    // 2. Dual-lock fallback: DOM UI Automation on mia.its.ac.id
    if (!apiSuccess) {
      try {
        _simulateDomCheckIn(code);
      } catch (_) {}
    }

    refs.btnCheckin.disabled = false;
    refs.btnCheckin.style.opacity = '1';
  }

  function _simulateDomCheckIn(code) {
    const buttons = Array.from(document.querySelectorAll('button, a'));
    const hadirBtn = buttons.find(b => b.textContent && b.textContent.trim().toLowerCase() === 'hadir');
    if (hadirBtn) hadirBtn.click();

    setTimeout(() => {
      const pinInputs = Array.from(document.querySelectorAll('input[data-index]'));
      if (pinInputs.length >= 6) {
        for (let i = 0; i < 6; i++) {
          pinInputs[i].value = code[i] || '';
          pinInputs[i].dispatchEvent(new Event('input', { bubbles: true }));
          pinInputs[i].dispatchEvent(new Event('change', { bubbles: true }));
        }
      } else {
        const textInputs = Array.from(document.querySelectorAll('input[type="text"], input:not([type])'));
        const modalInput = textInputs.find(i => i.placeholder && /kode/i.test(i.placeholder)) || textInputs[0];
        if (modalInput) {
          modalInput.value = code;
          modalInput.dispatchEvent(new Event('input', { bubbles: true }));
          modalInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }

      setTimeout(() => {
        const modalButtons = Array.from(document.querySelectorAll('.chakra-modal__content button, .modal button, [role="dialog"] button'));
        const submitBtn = modalButtons.find(b => /simpan|kirim|hadir/i.test(b.textContent || ''));
        if (submitBtn) submitBtn.click();
      }, 300);
    }, 250);
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
    let endTime;
    let ruleText;

    if (masa === 15) {
      endTime = startTime + (15 * 60 * 1000);
      ruleText = 'Lecturer Option: 15 Minutes';
    } else if (masa === 30) {
      endTime = startTime + (30 * 60 * 1000);
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
    const room = w.ruangan ? ` (${w.ruangan})` : '';
    const course = w.nama_mk || 'Active Class';
    const cfg = getSpoofConfig();

    const refs = _hudContainer._refs;
    if (refs.minTimer) refs.minTimer.textContent = timeFormatted;
    if (refs.title) refs.title.textContent = `${course}${room}`;
    if (refs.pill) {
      refs.pill.className = `hud-pill ${pillClass}`;
      refs.pill.textContent = `⏳ ${timeFormatted}`;
    }
    if (refs.rule) refs.rule.textContent = ruleText;
    if (refs.roomBadge) {
      if (currentConfig && currentConfig._autoRoomMatched) {
        refs.roomBadge.style.display = 'inline-block';
        refs.roomBadge.textContent = `📍 Auto-Room: ${currentConfig._autoRoomMatched}`;
      } else {
        refs.roomBadge.style.display = 'none';
      }
    }
    if (refs.spoof) {
      refs.spoof.innerHTML = cfg ? `<span style="color:#4ade80;">✓ Active</span>` : `<span style="color:#9ca3af;">Off</span>`;
    }
  }

  function _sniffPresensiPayload(url, rawText) {
    try {
      if (!rawText || typeof rawText !== 'string') return;
      if (url.includes('/api/presensi/dashboard') || url.includes('/api/presensi/tm')) {
        const json = JSON.parse(rawText);
        let widget = null;
        if (json.data && json.data.widget) {
          widget = json.data.widget;
        } else if (json.widget) {
          widget = json.widget;
        } else if (Array.isArray(json.data)) {
          widget = json.data.find(item => item && (item.status === 'sedang_berlangsung' || item.tm_mulai)) || null;
        } else if (json.data && typeof json.data === 'object') {
          widget = json.data;
        }
        if (widget) {
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
          if (_hudContainer && _hudContainer._refs && _hudContainer._refs.codeInput) {
            if (!_hudContainer._refs.codeInput.value && (widget.kode || widget.pin)) {
              _hudContainer._refs.codeInput.value = widget.kode || widget.pin;
            }
          }
        }
      }
    } catch (_) {}
  }

  // Intercept window.fetch
  if (window.fetch) {
    const _localFetch = _origFetch || window.fetch;
    const fetchProxy = new Proxy(_localFetch, {
      apply(target, thisArg, args) {
        let [resource, init] = args;
        const cfg = getSpoofConfig();
        const url = typeof resource === 'string' ? resource : (resource && resource.url) || '';

        // Double-lock payload rewrite for attendance submission
        if (cfg && url.includes('/api/presensi/tm/') && url.includes('/mahasiswa/self')) {
          try {
            if (init && init.body && typeof init.body === 'string') {
              const parsed = JSON.parse(init.body);
              const pos = buildPosition(cfg.lat, cfg.lng);
              parsed.latitude = pos.coords.latitude;
              parsed.longitude = pos.coords.longitude;
              init = Object.assign({}, init, { body: JSON.stringify(parsed) });
              args[1] = init;
              _sendSubmitTelemetry(pos.coords.latitude, pos.coords.longitude);
            }
          } catch (_) {}
        }

        const promise = Reflect.apply(target, thisArg, args);
        if (url.includes('/api/presensi/')) {
          promise.then(res => {
            try {
              res.clone().text().then(txt => _sniffPresensiPayload(url, txt));
            } catch (_) {}
          }).catch(() => {});
        }
        return promise;
      }
    });
    _cloak(fetchProxy, 'function fetch() { [native code] }');
    try { window.fetch = fetchProxy; } catch (_) {}
  }

  // Intercept XMLHttpRequest
  if (window.XMLHttpRequest) {
    const _origOpen = XMLHttpRequest.prototype.open;
    const _origSend = XMLHttpRequest.prototype.send;

    const openProxy = new Proxy(_origOpen, {
      apply(target, thisArg, args) {
        thisArg._requestUrl = args[1];
        thisArg._requestMethod = args[0];
        return Reflect.apply(target, thisArg, args);
      }
    });

    const sendProxy = new Proxy(_origSend, {
      apply(target, thisArg, args) {
        let body = args[0];
        const cfg = getSpoofConfig();
        const url = thisArg._requestUrl || '';

        if (cfg && url.includes('/api/presensi/tm/') && url.includes('/mahasiswa/self') && typeof body === 'string') {
          try {
            const parsed = JSON.parse(body);
            const pos = buildPosition(cfg.lat, cfg.lng);
            parsed.latitude = pos.coords.latitude;
            parsed.longitude = pos.coords.longitude;
            args[0] = JSON.stringify(parsed);
            _sendSubmitTelemetry(pos.coords.latitude, pos.coords.longitude);
          } catch (_) {}
        }

        if (url.includes('/api/presensi/')) {
          thisArg.addEventListener('load', () => {
            _sniffPresensiPayload(url, thisArg.responseText);
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

  // ── Phase 5: DOM Result Observer (accepted / rejected) ────────────────────
  const TARGET_DOMAIN = (currentConfig && currentConfig.targetDomain) || 'mia.its.ac.id';
  if (window.location.hostname === TARGET_DOMAIN ||
      window.location.hostname.endsWith('.' + TARGET_DOMAIN) ||
      window.location.hostname === 'mia.its.ac.id') {

    function _checkDomForResult(node) {
      if (!node || !node.textContent) return;
      const text = node.textContent.toLowerCase();
      // Accepted signals (Indonesian + common portal strings)
      if (
        text.includes('berhasil') ||
        text.includes('sukses') ||
        text.includes('presensi anda telah') ||
        text.includes('absensi berhasil') ||
        text.includes('hadir kuliah') ||
        text.includes('success') ||
        text.includes('data tersimpan')
      ) {
        _sendResultTelemetry('accepted');
        return;
      }
      // Rejected signals
      if (
        text.includes('gagal') ||
        text.includes('tidak valid') ||
        text.includes('tidak terdaftar') ||
        text.includes('lokasi tidak') ||
        text.includes('failed') ||
        text.includes('kadaluarsa') ||
        text.includes('telah ditutup') ||
        text.includes('error')
      ) {
        _sendResultTelemetry('rejected');
      }
    }

    // Selector list covers Chakra UI, SweetAlert2, Bootstrap alerts, and generic toast classes
    const RESULT_SELECTORS = [
      '.chakra-toast',
      '.chakra-alert',
      '[data-status="success"]',
      '[data-status="error"]',
      '#chakra-toast-manager-top-right',
      '.swal2-popup',
      '.alert',
      '.alert-success',
      '.alert-danger',
      '.toast',
      '.notification',
      '[role="alert"]',
      '.modal-body',
      '#swal2-html-container'
    ].join(',');

    const _observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue; // Element nodes only
          if (node.matches && node.matches(RESULT_SELECTORS)) {
            _checkDomForResult(node);
          }
          // Also check descendants (e.g., SweetAlert injects children)
          const matches = node.querySelectorAll && node.querySelectorAll(RESULT_SELECTORS);
          if (matches) {
            for (const el of matches) _checkDomForResult(el);
          }
        }
        // Also watch text changes in existing result containers
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

    // Start observing once DOM is ready
    if (document.body) {
      _observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        _observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      }, { once: true });
    }
  }

})();

