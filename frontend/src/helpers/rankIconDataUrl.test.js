import { describe, it, expect, vi } from "vitest";
import { rankIconDataUrl } from "./rankIconDataUrl";

const respond = (bytes, type = "image/webp", ok = true) =>
  vi.fn().mockResolvedValue({
    ok,
    headers: { get: (name) => (name.toLowerCase() === "content-type" ? type : null) },
    arrayBuffer: async () => Uint8Array.from(bytes).buffer,
  });

describe("rankIconDataUrl", () => {
  it("turns the site's own icon into inline image data", async () => {
    const fetchIcon = respond([0x52, 0x49, 0x46, 0x46]);
    expect(await rankIconDataUrl("/images/ranks/opgg/gold-1.webp", fetchIcon)).toBe("data:image/webp;base64,UklGRg==");
    expect(fetchIcon).toHaveBeenCalledWith("/images/ranks/opgg/gold-1.webp");
  });

  // Large icons must not blow the argument limit of String.fromCharCode.
  it("encodes an icon bigger than one chunk", async () => {
    const bytes = Array.from({ length: 70_000 }, (_, i) => i % 256);
    const url = await rankIconDataUrl("/images/ranks/opgg/gold-1.webp", respond(bytes, "image/png"));
    expect(url.startsWith("data:image/png;base64,")).toBe(true);
    expect(Buffer.from(url.split(",")[1], "base64")).toEqual(Buffer.from(bytes));
  });

  it("never fetches anything off this site", async () => {
    for (const url of ["https://cdn.example/x.webp", "//cdn.example/x.webp", "", null]) {
      const fetchIcon = respond([1]);
      expect(await rankIconDataUrl(url, fetchIcon)).toBeNull();
      expect(fetchIcon).not.toHaveBeenCalled();
    }
  });

  it("is nothing when the response is not an image or not there", async () => {
    expect(await rankIconDataUrl("/x.webp", respond([1], "text/html"))).toBeNull();
    expect(await rankIconDataUrl("/x.webp", respond([1], "image/webp", false))).toBeNull();
    expect(await rankIconDataUrl("/x.webp", vi.fn().mockRejectedValue(new Error("offline")))).toBeNull();
  });
});
