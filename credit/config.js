/**
 * GOSU Credit Manager — Runtime Configuration
 * Seamless dual-hosting:
 *  - Local Desktop / localhost: same-origin ("") -> /api/...
 *  - Public Web (gosucinema.web.id/credit/): AWS 24/7 API
 *  - Overrideable via ?api=<url|local|cloud>, ?mode=cloud|local,
 *    window.__GOSU_DESKTOP_CONFIG__, or localStorage.
 */
(function (global) {
  'use strict';

  var DEFAULT_CLOUD_API = 'https://47-130-105-240.sslip.io/credit-api';
  var DEFAULT_LOCAL_API = 'http://127.0.0.1:8790';
  var PUBLIC_WEB_URL = 'https://gosucinema.web.id/credit/';
  var STORAGE_API_KEY = 'gosu_credit_api_base';
  var STORAGE_PIN_KEY = 'gosu_credit_edit_pin';
  var STORAGE_THEME_KEY = 'gosu_credit_theme';
  var STORAGE_ACTOR_KEY = 'gosu_credit_actor';

  function normalizeBase(url) {
    if (!url) return '';
    var trimmed = String(url).trim();
    if (!trimmed) return '';
    var lower = trimmed.toLowerCase();
    if (lower === 'local' || lower === 'same-origin') {
      return isLocalHostname() ? '' : DEFAULT_LOCAL_API;
    }
    if (lower === 'cloud' || lower === 'aws') {
      return DEFAULT_CLOUD_API;
    }
    return trimmed.replace(/\/+$/, '');
  }

  function isLocalHostname() {
    var host = (global.location && global.location.hostname || '').toLowerCase();
    return host === '127.0.0.1' || host === 'localhost' || host === '[::1]' || host === '::1';
  }

  function getQueryParams() {
    try {
      return new URLSearchParams(global.location.search || '');
    } catch (_) {
      return new URLSearchParams('');
    }
  }

  function getDesktopInjectedConfig() {
    return (global.__GOSU_DESKTOP_CONFIG__ && typeof global.__GOSU_DESKTOP_CONFIG__ === 'object')
      ? global.__GOSU_DESKTOP_CONFIG__
      : null;
  }

  function resolveApiBase() {
    var params = getQueryParams();
    var queryApi = params.get('api');
    if (queryApi !== null && queryApi.trim() !== '') {
      return normalizeBase(queryApi);
    }

    var queryMode = (params.get('mode') || '').trim().toLowerCase();
    if (queryMode === 'cloud' || queryMode === 'aws') {
      return DEFAULT_CLOUD_API;
    }
    if (queryMode === 'local') {
      return isLocalHostname() ? '' : DEFAULT_LOCAL_API;
    }

    var injected = getDesktopInjectedConfig();
    if (injected && typeof injected.apiBase === 'string') {
      return normalizeBase(injected.apiBase);
    }

    try {
      var saved = global.localStorage.getItem(STORAGE_API_KEY);
      if (saved && saved.trim() !== '') {
        return normalizeBase(saved);
      }
    } catch (_) {
      // ignore storage restrictions
    }

    if (isLocalHostname()) {
      return '';
    }
    return DEFAULT_CLOUD_API;
  }

  function getApiModeLabel(base) {
    if (!base || base.indexOf('127.0.0.1') !== -1 || base.indexOf('localhost') !== -1) {
      return 'Local PC';
    }
    if (base.indexOf('47-130-105-240') !== -1 || base.indexOf('gosucinema') !== -1) {
      return 'Cloud 24/7';
    }
    return 'Custom API';
  }

  function isDesktopMode() {
    var params = getQueryParams();
    if (params.get('desktop') === '1' || params.get('desktop') === 'true') {
      return true;
    }
    var injected = getDesktopInjectedConfig();
    return Boolean(injected && injected.desktop);
  }

  function consumeInitialPin() {
    var pin = '';
    var params = getQueryParams();
    var queryPin = params.get('pin');
    if (queryPin && queryPin.trim()) {
      pin = queryPin.trim();
      try {
        params.delete('pin');
        var qs = params.toString();
        var cleanUrl = global.location.pathname + (qs ? '?' + qs : '') + (global.location.hash || '');
        if (global.history && typeof global.history.replaceState === 'function') {
          global.history.replaceState(null, '', cleanUrl);
        }
      } catch (_) {
        // ignore history error
      }
      return pin;
    }

    var injected = getDesktopInjectedConfig();
    if (injected && typeof injected.pin === 'string' && injected.pin.trim()) {
      return injected.pin.trim();
    }
    return '';
  }

  function getInitialThemeOverride() {
    var params = getQueryParams();
    var t = (params.get('theme') || '').toLowerCase();
    if (t === 'light' || t === 'dark') return t;
    return null;
  }

  function setCustomApiBase(url) {
    var normalized = normalizeBase(url);
    try {
      if (!url || !String(url).trim()) {
        global.localStorage.removeItem(STORAGE_API_KEY);
      } else {
        global.localStorage.setItem(STORAGE_API_KEY, normalized);
      }
    } catch (_) {
      // ignore
    }
    global.GOSU_CONFIG.API_BASE = resolveApiBase();
    return global.GOSU_CONFIG.API_BASE;
  }

  var initialApiBase = resolveApiBase();

  global.GOSU_CONFIG = {
    DEFAULT_CLOUD_API: DEFAULT_CLOUD_API,
    DEFAULT_LOCAL_API: DEFAULT_LOCAL_API,
    PUBLIC_WEB_URL: PUBLIC_WEB_URL,
    STORAGE_API_KEY: STORAGE_API_KEY,
    STORAGE_PIN_KEY: STORAGE_PIN_KEY,
    STORAGE_THEME_KEY: STORAGE_THEME_KEY,
    STORAGE_ACTOR_KEY: STORAGE_ACTOR_KEY,
    API_BASE: initialApiBase,
    isLocalHostname: isLocalHostname,
    isDesktopMode: isDesktopMode,
    getApiBase: function () {
      return global.GOSU_CONFIG.API_BASE;
    },
    getApiModeLabel: function () {
      return getApiModeLabel(global.GOSU_CONFIG.API_BASE);
    },
    setCustomApiBase: setCustomApiBase,
    consumeInitialPin: consumeInitialPin,
    getInitialThemeOverride: getInitialThemeOverride,
    apiUrl: function (path) {
      var cleanPath = path.charAt(0) === '/' ? path : '/' + path;
      return global.GOSU_CONFIG.API_BASE + cleanPath;
    }
  };
})(window);
