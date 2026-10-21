// index.html defines gtag before the bundle runs and queues onto dataLayer
// until the library loads, so an event sent early is replayed, not lost.
export const trackEvent = (name, params) => {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", name, params);
};
