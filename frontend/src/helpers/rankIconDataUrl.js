// The recap image is an SVG rasterised from a blob, which may not fetch
// anything, so the rank icon has to travel inside it as inline data. Only the
// site's own files are read: anything else would be a request to someone else.
const CHUNK = 0x8000;

const toBase64 = (bytes) => {
  let binary = "";
  for (let start = 0; start < bytes.length; start += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(start, start + CHUNK));
  }
  return btoa(binary);
};

export const rankIconDataUrl = async (url, fetchIcon = fetch) => {
  if (typeof url !== "string" || !url.startsWith("/") || url.startsWith("//")) return null;
  try {
    const response = await fetchIcon(url);
    if (!response?.ok) return null;
    const type = String(response.headers.get("content-type") || "").split(";")[0].trim();
    if (type !== "image/webp" && type !== "image/png") return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    return `data:${type};base64,${toBase64(bytes)}`;
  } catch {
    return null;
  }
};
