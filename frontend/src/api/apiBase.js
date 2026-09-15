// Points at our own subdomain rather than the Render service hostname, so moving
// the backend between regions is a DNS change with no deploy.
export const PRODUCTION_API_URL = "https://api.pubgtracker.top/api";

// Relative on purpose: the dev server proxies /api to localhost:3003.
export const DEVELOPMENT_API_URL = "/api";

// Kept out of config.js because vite.config.js needs the same answer while it is
// writing index.html, and it cannot reach import.meta.env from there.
export const resolveApiUrl = ({ mode, override } = {}) => {
  if (override) return override;
  return mode === "development" ? DEVELOPMENT_API_URL : PRODUCTION_API_URL;
};

// Forty-five seconds and not five. The API sleeps after fifteen idle minutes on
// the free plan and has been measured cold-starting in 22.9 s, so a tighter
// bound would turn a slow first load into a visible error on a request that was
// going to succeed. Lives here rather than in fetch.js because the inline
// preload needs the same bound and cannot import a module that reaches antd.
export const API_TIMEOUT_MS = 45_000;

// One factory so a request that ran out of time reads the same whether it was
// this module's AbortController or the inline preload's AbortSignal.timeout
// that cut it off. Told apart from a network error on purpose: a caller that
// wants to say "the server is waking up, try again" needs to know which it got.
export const requestTimeoutError = (timeoutMs = API_TIMEOUT_MS) => {
  const error = new Error(`Request timed out after ${timeoutMs}ms`);
  error.timeout = true;
  return error;
};
