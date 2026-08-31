import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const html = readFileSync(
  fileURLToPath(new URL("../../index.html", import.meta.url)),
  "utf8",
);

const ogPngPath = fileURLToPath(new URL("../../public/og.png", import.meta.url));

// Every <meta> in the head, as { key, attr, content } — attr records whether the
// tag identified itself with `property` or `name`, because the two are not
// interchangeable for every consumer.
const metaTags = () => {
  const out = [];
  const re = /<meta\s+([^>]*?)\/?>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    const raw = match[1];
    const key = /\b(property|name)\s*=\s*"([^"]+)"/i.exec(raw);
    const content = /\bcontent\s*=\s*"([^"]*)"/i.exec(raw);
    if (key && content) out.push({ key: key[2], attr: key[1].toLowerCase(), content: content[1] });
  }
  return out;
};

const contentOf = (key) => {
  const hit = metaTags().find((tag) => tag.key === key);
  return hit ? hit.content : undefined;
};

// PNG header: 8-byte signature, then a 4-byte length and the "IHDR" tag, then
// width and height as big-endian uint32.
const pngSize = (path) => {
  const buf = readFileSync(path);
  expect(buf.subarray(1, 4).toString("ascii")).toBe("PNG");
  expect(buf.subarray(12, 16).toString("ascii")).toBe("IHDR");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
};

describe("share-card meta in index.html", () => {
  it.each(["og:image", "twitter:image"])("%s is an absolute URL", (key) => {
    expect(contentOf(key)).toMatch(/^https:\/\//);
  });

  // A relative path is dropped by OG scrapers, and no major platform rasterises
  // SVG in a share card — both were true of the original "/logo.svg".
  it.each(["og:image", "twitter:image"])("%s points at a PNG, not an SVG", (key) => {
    expect(contentOf(key)).toMatch(/\.png$/);
  });

  it("declares the card's own dimensions", () => {
    expect(contentOf("og:image:width")).toBe("1200");
    expect(contentOf("og:image:height")).toBe("630");
  });

  it("gives the card alt text", () => {
    expect(contentOf("og:image:alt")).toBeTruthy();
  });

  // X's card spec identifies its tags with `name`. The file used `property` for
  // all five, which is the Open Graph attribute.
  it("identifies every twitter:* tag with name=", () => {
    const wrong = metaTags().filter((tag) => tag.key.startsWith("twitter:") && tag.attr !== "name");
    expect(wrong.map((tag) => tag.key)).toEqual([]);
  });
});

describe("the share card itself", () => {
  it("is committed to public/", () => {
    expect(existsSync(ogPngPath)).toBe(true);
  });

  it("is the size the meta tags claim", () => {
    expect(pngSize(ogPngPath)).toEqual({
      width: Number(contentOf("og:image:width")),
      height: Number(contentOf("og:image:height")),
    });
  });
});
