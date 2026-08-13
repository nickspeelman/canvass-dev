(() => {
  'use strict';

  const MEASUREMENT_ID = 'G-30SN02B5HP';
  const STORAGE_KEY = 'canvas_analytics_consent_v1';
  const COOKIE_PREFIXES = ['_ga', '_gid', '_gat'];

  let analyticsLoaded = false;

  function getChoice() {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return value === 'granted' || value === 'denied' ? value : null;
    } catch (_) {
      return null;
    }
  }

  function saveChoice(value) {
    try { localStorage.setItem(STORAGE_KEY, value); } catch (_) {}
  }

  function expireAnalyticsCookies() {
    const hostname = location.hostname;
    const domainParts = hostname.split('.');
    const candidateDomains = [hostname];
    if (domainParts.length >= 2) candidateDomains.push(`.${domainParts.slice(-2).join('.')}`);

    document.cookie.split(';').forEach(cookie => {
      const name = cookie.split('=')[0].trim();
      if (!COOKIE_PREFIXES.some(prefix => name === prefix || name.startsWith(`${prefix}_`))) return;
      document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
      candidateDomains.forEach(domain => {
        document.cookie = `${name}=; Max-Age=0; path=/; domain=${domain}; SameSite=Lax`;
      });
    });
  }

  function loadAnalytics() {
    if (analyticsLoaded || getChoice() !== 'granted') return;
    analyticsLoaded = true;
    window[`ga-disable-${MEASUREMENT_ID}`] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag(){ window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', MEASUREMENT_ID);

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`;
    script.dataset.canvasAnalytics = 'true';
    document.head.appendChild(script);
  }

  function disableAnalytics() {
    window[`ga-disable-${MEASUREMENT_ID}`] = true;
    expireAnalyticsCookies();
  }

  function banner() {
    return document.getElementById('analyticsConsent');
  }

  function showBanner() {
    const el = banner();
    if (el) {
      el.hidden = false;
      requestAnimationFrame(() => el.classList.add('is-visible'));
    }
  }

  function hideBanner() {
    const el = banner();
    if (!el) return;
    el.classList.remove('is-visible');
    window.setTimeout(() => { el.hidden = true; }, 180);
  }

  function setChoice(value) {
    saveChoice(value);
    if (value === 'granted') loadAnalytics();
    else disableAnalytics();
    hideBanner();
    document.dispatchEvent(new CustomEvent('canvas:analytics-consent-changed', { detail: { value } }));
  }

  function init() {
    const choice = getChoice();
    if (choice === 'granted') loadAnalytics();
    else if (choice === 'denied') disableAnalytics();
    else showBanner();

    document.querySelectorAll('[data-consent-accept]').forEach(button => {
      button.addEventListener('click', () => setChoice('granted'));
    });
    document.querySelectorAll('[data-consent-decline]').forEach(button => {
      button.addEventListener('click', () => setChoice('denied'));
    });
    document.querySelectorAll('[data-analytics-settings]').forEach(button => {
      button.addEventListener('click', event => {
        event.preventDefault();
        showBanner();
      });
    });
  }

  window.CanvasPrivacy = {
    getAnalyticsConsent: getChoice,
    openAnalyticsSettings: showBanner,
    setAnalyticsConsent: setChoice
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
