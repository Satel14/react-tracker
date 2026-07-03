export const classifyPlayerError = (message) => {
  const raw = typeof message === "string" ? message : "";
  const lower = raw.toLowerCase();
  let code = "generic";
  if (lower.includes("not found")) code = "not_found";
  else if (lower.includes("rate limit")) code = "rate_limit";
  else if (lower.includes("private")) code = "private";
  else if (lower.includes("network") || lower.includes("fetch")) code = "network";
  return { code, message: raw || null };
};
