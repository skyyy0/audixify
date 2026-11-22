export async function compressImageFile(
  file: File,
  options: { maxDim: number; maxDataUrlChars: number; squareCrop?: boolean },
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose a valid image file (PNG, JPG, or WebP).');
  }

  const bitmapUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Unable to decode selected image.'));
      el.src = bitmapUrl;
    });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Image processing unavailable in this browser.');

    let sx = 0;
    let sy = 0;
    let sw = img.naturalWidth || img.width;
    let sh = img.naturalHeight || img.height;
    let dw = sw;
    let dh = sh;

    if (options.squareCrop) {
      const side = Math.min(sw, sh);
      sx = Math.floor((sw - side) / 2);
      sy = Math.floor((sh - side) / 2);
      sw = side;
      sh = side;
      const target = Math.min(options.maxDim, side);
      dw = target;
      dh = target;
    } else {
      const scale = Math.min(1, options.maxDim / Math.max(sw, sh));
      dw = Math.max(1, Math.round(sw * scale));
      dh = Math.max(1, Math.round(sh * scale));
    }

    canvas.width = dw;
    canvas.height = dh;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);

    let quality = 0.82;
    let output = canvas.toDataURL('image/jpeg', quality);
    while (output.length > options.maxDataUrlChars && quality > 0.35) {
      quality -= 0.12;
      output = canvas.toDataURL('image/jpeg', quality);
    }

    if (output.length > options.maxDataUrlChars) {
      // Scale down one step if still over budget
      canvas.width = Math.max(64, Math.round(dw * 0.7));
      canvas.height = Math.max(64, Math.round(dh * 0.7));
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      output = canvas.toDataURL('image/jpeg', 0.68);
    }

    if (output.length > options.maxDataUrlChars) {
      throw new Error('Image is still too large after compression. Try a smaller screenshot.');
    }

    return output;
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }
}
