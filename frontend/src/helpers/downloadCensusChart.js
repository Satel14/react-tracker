import { CENSUS_CHART_WIDTH, CENSUS_CHART_HEIGHT, censusChartFilename, censusChartSvg } from "./censusChart";

const pngBlob = async (svg) => {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("Chart image could not be loaded"));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = CENSUS_CHART_WIDTH;
    canvas.height = CENSUS_CHART_HEIGHT;
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

export const downloadCensusChart = async (data, { t, language, format }) => {
  if (format !== "png" && format !== "svg") throw new Error("Unsupported chart format");
  const svg = censusChartSvg(data, { t, language });
  const blob = format === "png" ? await pngBlob(svg) : new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  try {
    link.href = url;
    link.download = censusChartFilename(data, language, format);
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    // Leave the browser time to start reading the download before revocation.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
};
