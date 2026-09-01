// Optional-chained: the build config renders /ranks with these modules in a
// plain esbuild bundle, where import.meta.env does not exist at all.
//
// Points at our own subdomain rather than the Render service hostname, so moving
// the backend between regions is a DNS change with no deploy.
const DEFAULT_API_URL =
  import.meta.env?.MODE === "development"
    ? "/api"
    : "https://api.pubgtracker.top/api";

export const API_URL = import.meta.env?.VITE_API_URL || DEFAULT_API_URL;

export const resolveAbsoluteApiUrl = () => {
  if (typeof window !== "undefined" && API_URL.startsWith("/")) {
    return `${window.location.origin}${API_URL}`;
  }
  return API_URL;
};
