import { API_TIMEOUT_MS } from './apiBase'
import { API_URL } from './config'
import openNotification from './../component/Notification';
const headers = {
  Accept: "application/json",
  "Content-Type": "application/json",
};

// Nothing bounded the wait before this, and the failure it allowed was the
// quiet kind: a connection that neither answers nor fails leaves a skeleton on
// screen with no error state and no retry, which is indistinguishable from the
// site being broken. This only cuts off the case that was never going to answer.
const TIMEOUT_MS = API_TIMEOUT_MS;

const withTimeout = async (run, timeoutMs = TIMEOUT_MS) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await run(controller.signal);
  } catch (error) {
    // Told apart from a network error on purpose: a caller that wants to say
    // "the server is waking up, try again" needs to know which one it got.
    if (controller.signal.aborted) {
      const timedOut = new Error(`Request timed out after ${timeoutMs}ms`);
      timedOut.timeout = true;
      throw timedOut;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

const parseErrorPayload = async (result) => {
  try {
    return await result.json();
  } catch (_e) {
    return null;
  }
};

const finishResponse = async (result, notificationErr) => {
  if (result.ok) {
    return result.json();
  }

  const payload = await parseErrorPayload(result);
  const message = payload?.message || payload?.data?.message || null;

  if (notificationErr) {
    openNotification("error", "Request error", message || "Problems on server.");
  }

  const error = new Error(message || `Request failed with status ${result.status}`);
  error.status = result.status;
  error.payload = payload;
  throw error;
};

// For a response this module did not start: the inline preload in index.html
// runs before any of this exists, and its answer still has to be read, failed
// and reported exactly the way a request made here would be.
export const adoptResponse = (result, notificationErr = false) =>
  finishResponse(result, notificationErr);

export const post = async (destination, body, notificationErr = false) => {
  return withTimeout(async (signal) => {
    const result = await fetch(`${API_URL}${destination}`, {
      method: "POST",
      body: JSON.stringify(body),
      headers,
      signal,
    });
    return finishResponse(result, notificationErr);
  });
};

export const get = async (destination, notificationErr = false) => {
  return withTimeout(async (signal) => {
    const result = await fetch(`${API_URL}${destination}`, {
      method: "GET",
      signal,
    });
    return finishResponse(result, notificationErr);
  });
};
