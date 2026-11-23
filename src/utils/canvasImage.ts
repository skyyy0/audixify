export function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

export function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  zoom = 1,
): void {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;

  const scale = Math.max(dw / iw, dh / ih) * Math.max(1, zoom);
  const sw = dw / scale;
  const sh = dh / scale;
  const sx = (iw - sw) / 2;
  const sy = (ih - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

export function truncateCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 2 && ctx.measureText(`${out}…`).width > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}

function loadSingleImage(src: string, crossOrigin?: string, timeoutMs = 4500): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    if (crossOrigin) {
      img.crossOrigin = crossOrigin;
    }
    const timer = window.setTimeout(() => resolve(null), timeoutMs);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    img.src = src;
  });
}

export async function loadCorsSafeImage(url?: string): Promise<HTMLImageElement | null> {
  if (!url) return null;
  if (
    url.startsWith('data:') ||
    url.startsWith('blob:') ||
    url.startsWith('/')
  ) {
    return loadSingleImage(url, undefined, 4500);
  }

  // Upgrade iTunes thumb to 600x600 crisp resolution when available
  const highResUrl = url.replace(/\/(100|200)x\1bb\./i, '/600x600bb.');

  // Prefer same-origin proxy first so Safari/Chrome never taint the 2D canvas
  const proxied = await loadSingleImage(
    `/api/artwork-proxy?url=${encodeURIComponent(highResUrl)}`,
    'anonymous',
    4500,
  );
  if (proxied) return proxied;

  return loadSingleImage(highResUrl, 'anonymous', 3500);
}
