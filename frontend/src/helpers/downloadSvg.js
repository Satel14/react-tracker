// Browser-only: rasterises a self-contained SVG and hands it to the user as a
// file. Shared by the census chart and the season recap image.

const pngBlob = async (svg, width, height) => {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("Image could not be loaded"));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable");
    context.drawImage(image, 0, 0);
    return await new Promise((resolve, reject) => canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("PNG export failed")),
      "image/png",
    ));
  } finally {
    URL.revokeObjectURL(url);
  }
};

export const downloadSvg = async (svg, { width, height, filename, format = "png" }) => {
  if (format !== "png" && format !== "svg") throw new Error("Unsupported image format");
  const blob = format === "png"
    ? await pngBlob(svg, width, height)
    : new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  try {
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    // Leave the browser time to start reading the download before revocation.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
};
