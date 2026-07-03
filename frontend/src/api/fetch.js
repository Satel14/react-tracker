import { API_URL } from './config'
import openNotification from './../component/Notification';
const headers = {
  Accept: "application/json",
  "Content-Type": "application/json",
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

export const post = async (destination, body, notificationErr = false) => {
  const result = await fetch(`${API_URL}${destination}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers,
  });
  return finishResponse(result, notificationErr);
};

export const get = async (destination, notificationErr = false) => {
  const result = await fetch(`${API_URL}${destination}`, {
    method: "GET",
  });
  return finishResponse(result, notificationErr);
};
