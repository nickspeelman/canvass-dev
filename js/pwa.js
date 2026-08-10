(() => {
  const versionEl = document.getElementById("appVersion");
  function showVersion(version) {
    if (versionEl && version) versionEl.textContent = `Version ${version}`;
  }

  async function requestVersion(worker) {
    if (!worker) return false;
    return new Promise(resolve => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => resolve(false), 1200);
      channel.port1.onmessage = event => {
        clearTimeout(timer);
        const version = event.data?.version;
        if (version) showVersion(version);
        resolve(Boolean(version));
      };
      worker.postMessage({ type: "CANVASS_VERSION_REQUEST" }, [channel.port2]);
    });
  }

  if (!("serviceWorker" in navigator)) {
    if (versionEl) versionEl.textContent = "Version unavailable";
    return;
  }

  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("service-worker.js", { updateViaCache: "none" });
      // Check for a newly deployed worker on every full page load.
      await registration.update();
      await requestVersion(registration.active || registration.waiting || registration.installing);

      // If this page was loaded under an older controlling worker, reload once
      // the newly installed worker takes control. The fresh controller then
      // fetches the matching deployed CSS/JS instead of leaving a mixed build
      // visible until the user manually refreshes.
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        window.location.reload();
      }, { once: true });
    } catch (_) {
      if (versionEl) versionEl.textContent = "Version unavailable";
      // The drawing instrument remains fully usable if service workers are unavailable.
    }
  });
})();
