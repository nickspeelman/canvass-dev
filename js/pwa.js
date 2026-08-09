(() => {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {
      // The drawing instrument remains fully usable if service workers are unavailable.
    });
  });
})();
