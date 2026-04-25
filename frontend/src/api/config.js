const DEFAULT_API_URL =
  process.env.NODE_ENV === "development"
    ? "/api"
    : "https://pubgtracker-api.onrender.com/api";

export const API_URL = process.env.REACT_APP_API_URL || DEFAULT_API_URL;
