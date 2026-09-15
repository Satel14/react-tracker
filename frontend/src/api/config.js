import { resolveApiUrl } from "./apiBase";

// Optional-chained: the build config renders /ranks with these modules in a
// plain esbuild bundle, where import.meta.env does not exist at all.
export const API_URL = resolveApiUrl({
  mode: import.meta.env?.MODE,
  override: import.meta.env?.VITE_API_URL,
});

export const resolveAbsoluteApiUrl = () => {
  if (typeof window !== "undefined" && API_URL.startsWith("/")) {
    return `${window.location.origin}${API_URL}`;
  }
  return API_URL;
};
