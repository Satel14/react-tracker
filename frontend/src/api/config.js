const DEFAULT_API_URL =
  import.meta.env.MODE === "development"
    ? "/api"
    : "https://pubgtracker-api.onrender.com/api";

export const API_URL = import.meta.env.VITE_API_URL || DEFAULT_API_URL;
