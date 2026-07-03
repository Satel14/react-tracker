const DEFAULT_API_URL =
  import.meta.env.MODE === "development"
    ? "/api"
    : "https://pubgtracker-api.onrender.com/api";

export const API_URL = import.meta.env.VITE_API_URL || DEFAULT_API_URL;

export const resolveAbsoluteApiUrl = () => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  if (
    typeof window !== "undefined" &&
    /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)
  ) {
    return `${window.location.origin}/api`;
  }
  return "https://pubgtracker-api.onrender.com/api";
};
