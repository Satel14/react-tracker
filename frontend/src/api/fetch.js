import { API_URL } from './config'
import openNotification from './../component/Notification';
const headers = {
  Accept: "application/json",
  "Content-Type": "application/json",
};

export const post = async (destination, body, notificationErr = false) => {
  const result = await fetch(`${API_URL}${destination}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers,
  });

  if (result.ok) {
    return result.json();
  }

  if (result.status !== 200 && notificationErr) {
    openNotification("error", "Server error", "Problems on server.");
  }

  // eslint-disable-next-line no-throw-literal
  throw { error: result.status };
};