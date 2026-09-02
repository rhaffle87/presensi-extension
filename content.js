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

  // Phase 1: Native Function Caching
  const _addEventListener    = window.addEventListener.bind(window);
  const _removeEventListener = window.removeEventListener.bind(window);
  const _dispatchEvent       = window.dispatchEvent.bind(window);
  const _CustomEvent         = CustomEvent;
  const _setTimeout          = setTimeout;
  const _setInterval         = setInterval;
  const _clearInterval       = clearInterval;

  const _geoProto               = Geolocation.prototype;
  const _origGetCurrentPosition = _geoProto.getCurrentPosition;
  const _origWatchPosition      = _geoProto.watchPosition;
  const _origClearWatch         = _geoProto.clearWatch;

  //  Phase 2: .toString() Cloaking 
  const _origFnToString = Function.prototype.toString;
  const _nativeStringMap = new Map();

  const _toStringProxy = new Proxy(_origFnToString, {
    apply(target, thisArg, args) {
      if (_nativeStringMap.has(thisArg)) return _nativeStringMap.get(thisArg);
      return Reflect.apply(target, thisArg, args);
    }
  });

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

  function getSpoofConfig() {
    if (!currentConfig) return null;
    const targetDomain = currentConfig.targetDomain || atob('bWlhLml0cy5hYy5pZA==');
    if (window.location.hostname !== targetDomain) return null;
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

  //  Geolocation Proxy Hooks â”€
  const getCurrentPositionProxy = new Proxy(_origGetCurrentPosition, {
    apply(target, thisArg, argumentsList) {
      const cfg = getSpoofConfig();
      if (cfg) {
        const [successCallback] = argumentsList;
        _setTimeout(() => {
          if (typeof successCallback === 'function') {
            successCallback(buildPosition(cfg.lat, cfg.lng));
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
      } catch (e) {}
    }
  }, true);

  // Request the initial config, passing our secure session token as a primitive string
  // to avoid Firefox Xray wrapper object cloning issues.
  // We retry every 10ms to ensure the background bridge has had time to load.
  function requestConfig() {
    if (configReceived) return;
    _dispatchEvent(new _CustomEvent(reqEvent, { detail: sessionToken }));
    setTimeout(requestConfig, 10);
  }
  requestConfig();

})();
