(() => {
  const PAYPAL_URL = "https://www.paypal.com/donate/?hosted_button_id=SJ8XEU3D7BW5J";

  // Use the top-level browsing context when possible. This also makes the
  // redirect behave correctly if /donate/ is ever opened from an embedded UI.
  try {
    if (window.top && window.top !== window) {
      window.top.location.replace(PAYPAL_URL);
      return;
    }
  } catch (_) {
    // Cross-origin frame access can throw; fall through to normal navigation.
  }

  try {
    window.location.replace(PAYPAL_URL);
  } catch (_) {
    window.location.href = PAYPAL_URL;
  }
})();
