export const buildGradient = (stops) => {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const ramp = new Uint8ClampedArray(1024);
    for (let i = 0; i < 256; i += 1) {
      ramp[i * 4] = i;
      ramp[i * 4 + 1] = i;
      ramp[i * 4 + 2] = i;
      ramp[i * 4 + 3] = 255;
    }
    return ramp;
  }
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  stops.forEach(([offset, color]) => grad.addColorStop(offset, color));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1, 256);
  return ctx.getImageData(0, 0, 1, 256).data;
};

export const DEFAULT_STOPS = [
  [0.0, "rgba(0,0,255,0)"],
  [0.4, "#3b82f6"],
  [0.65, "#22d3a8"],
  [0.85, "#fde047"],
  [1.0, "#ef4444"],
];

export const drawHeat = (ctx, points, { size, mapMax, radius = 18, gradient } = {}) => {
  if (!ctx) return;
  ctx.clearRect(0, 0, size, size);
  ctx.globalCompositeOperation = "source-over";
  for (const p of points) {
    const px = (p.x / mapMax) * size;
    const py = (p.y / mapMax) * size;
    const g = ctx.createRadialGradient(px, py, 0, px, py, radius);
    g.addColorStop(0, "rgba(0,0,0,0.18)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  const img = ctx.getImageData(0, 0, size, size);
  const ramp = gradient || buildGradient(DEFAULT_STOPS);
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha === 0) continue;
    const offset = alpha * 4;
    data[i] = ramp[offset];
    data[i + 1] = ramp[offset + 1];
    data[i + 2] = ramp[offset + 2];
    data[i + 3] = Math.min(255, alpha * 3);
  }
  ctx.putImageData(img, 0, 0);
};
