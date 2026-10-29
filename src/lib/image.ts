/** 画像まわりの共通処理 */

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('画像の変換に失敗しました'))), type, quality),
  );
}

export async function loadImage(src: Blob | string): Promise<HTMLImageElement> {
  const url = typeof src === 'string' ? src : URL.createObjectURL(src);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    if (typeof src !== 'string') setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export function newCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** 画像をキャンバスに（長辺を maxSide 以下に縮小。写真の向きはブラウザが補正） */
export function imageToCanvas(img: CanvasImageSource & { width: number; height: number }, maxSide = 2400): HTMLCanvasElement {
  const iw = (img as HTMLImageElement).naturalWidth || img.width;
  const ih = (img as HTMLImageElement).naturalHeight || img.height;
  const s = Math.min(1, maxSide / Math.max(iw, ih));
  const c = newCanvas(iw * s, ih * s);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

export function cloneCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = newCanvas(src.width, src.height);
  c.getContext('2d')!.drawImage(src, 0, 0);
  return c;
}

export async function makeThumb(src: HTMLCanvasElement, width = 360): Promise<Blob> {
  const s = width / src.width;
  const c = newCanvas(width, src.height * s);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return canvasToBlob(c, 'image/jpeg', 0.8);
}

/** 明るさ・コントラストの自動調整（明るさの上下1%を引き伸ばす） */
export function autoLevels(src: HTMLCanvasElement, clip = 0.01): HTMLCanvasElement {
  const c = cloneCanvas(src);
  const ctx = c.getContext('2d')!;
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) hist[(d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8]++;
  const total = d.length / 4;
  let lo = 0;
  let hi = 255;
  for (let acc = 0; lo < 255 && acc + hist[lo] < total * clip; lo++) acc += hist[lo];
  for (let acc = 0; hi > 0 && acc + hist[hi] < total * clip; hi--) acc += hist[hi];
  if (hi - lo < 10) return c;
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = ((v - lo) * 255) / (hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    d[i] = lut[d[i]];
    d[i + 1] = lut[d[i + 1]];
    d[i + 2] = lut[d[i + 2]];
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** 指定範囲のまわりの色（背景色）を推定する。マスク色の自動取得用 */
export function sampleBackground(src: HTMLCanvasElement, x: number, y: number, w: number, h: number): string {
  const ctx = src.getContext('2d', { willReadFrequently: true })!;
  const pad = Math.max(2, Math.round(Math.min(w, h) * 0.15));
  const x0 = Math.max(0, Math.round(x - pad));
  const y0 = Math.max(0, Math.round(y - pad));
  const x1 = Math.min(src.width, Math.round(x + w + pad));
  const y1 = Math.min(src.height, Math.round(y + h + pad));
  const d = ctx.getImageData(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)).data;
  // 明るい方の上位40%の平均（文字の色を除外）
  const px: [number, number, number, number][] = [];
  for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2], d[i] + d[i + 1] + d[i + 2]]);
  px.sort((a, b) => b[3] - a[3]);
  const top = px.slice(0, Math.max(1, Math.floor(px.length * 0.4)));
  const avg = [0, 1, 2].map((k) => Math.round(top.reduce((s, p) => s + p[k], 0) / top.length));
  return '#' + avg.map((v) => v.toString(16).padStart(2, '0')).join('');
}
