const values = new Map();
const pending = new Set();

export const readStoredItem = (key) => {
  if (typeof window === "undefined") return null;
  // A failed write must win over the old disk value for this page session.
  if (pending.has(key)) return values.get(key) ?? null;
  try {
    const storage = window.localStorage;
    if (storage) {
      const value = storage.getItem(key);
      values.set(key, value);
      return value;
    }
  } catch (_e) {
    // Storage can be denied even when accessing the localStorage getter.
  }
  return values.get(key) ?? null;
};

const updateStoredItem = (key, value) => {
  if (typeof window === "undefined") return;
  values.set(key, value);
  pending.add(key);
  try {
    const storage = window.localStorage;
    if (storage) {
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, value);
      pending.delete(key);
    }
  } catch (_e) {
    // Keep the choice in memory when browser policy or quota rejects it.
  }
};

export const writeStoredItem = (key, value) => updateStoredItem(key, String(value));
export const removeStoredItem = (key) => updateStoredItem(key, null);
