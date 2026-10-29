/* eslint-disable @typescript-eslint/no-explicit-any */
// OpenCV.js を使った画像処理（使う時だけ読み込む：約13MB、2回目以降はキャッシュ）
import { cloneCanvas, newCanvas } from './image';

type CV = any;
let cvPromise: Promise<CV> | null = null;

export function loadCv(): Promise<CV> {
  if (!cvPromise) {
    cvPromise = (async () => {
      const mod: any = await import('@techstark/opencv-js');
      let cv = mod.default ?? mod;
      if (cv instanceof Promise || typeof cv?.then === 'function') cv = await cv;
      if (!cv.Mat) {
        await new Promise<void>((res) => {
          cv.onRuntimeInitialized = () => res();
        });
      }
      return cv;
    })().catch((e) => {
      cvPromise = null;
      throw e;
    });
  }
  return cvPromise;
}

export interface Pt {
  x: number;
  y: number;
}

function odd(n: number) {
  const r = Math.max(3, Math.round(n));
  return r % 2 ? r : r + 1;
}

/** 書類の四隅を自動検出（比率座標：左上・右上・右下・左下）。見つからなければ少し内側の四隅 */
export async function detectCorners(src: HTMLCanvasElement): Promise<Pt[]> {
  const fallback = [
    { x: 0.03, y: 0.03 },
    { x: 0.97, y: 0.03 },
    { x: 0.97, y: 0.97 },
    { x: 0.03, y: 0.97 },
  ];
  const cv = await loadCv();
  const s = Math.min(1, 800 / Math.max(src.width, src.height));
  const small = newCanvas(src.width * s, src.height * s);
  small.getContext('2d')!.drawImage(src, 0, 0, small.width, small.height);
  const mats: any[] = [];
  const m = <T>(x: T) => (mats.push(x), x);
  try {
    const img = m(cv.imread(small));
    const gray = m(new cv.Mat());
    cv.cvtColor(img, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
    const edges = m(new cv.Mat());
    cv.Canny(gray, edges, 50, 150);
    const k = m(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5)));
    cv.dilate(edges, edges, k);
    const contours = m(new cv.MatVector());
    const hier = m(new cv.Mat());
    cv.findContours(edges, contours, hier, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    let best: Pt[] | null = null;
    let bestArea = small.width * small.height * 0.2;
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i);
      const peri = cv.arcLength(c, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(c, approx, 0.02 * peri, true);
      const area = cv.contourArea(approx);
      if (approx.rows === 4 && area > bestArea && cv.isContourConvex(approx)) {
        bestArea = area;
        best = [];
        for (let j = 0; j < 4; j++) {
          best.push({ x: approx.data32S[j * 2] / small.width, y: approx.data32S[j * 2 + 1] / small.height });
        }
      }
      approx.delete();
      c.delete();
    }
    return best ? orderCorners(best) : fallback;
  } catch (e) {
    console.warn(e);
    return fallback;
  } finally {
    mats.forEach((x) => x.delete?.());
  }
}

/** 左上・右上・右下・左下の順に並べる */
export function orderCorners(p: Pt[]): Pt[] {
  const sum = [...p].sort((a, b) => a.x + a.y - (b.x + b.y));
  const diff = [...p].sort((a, b) => a.y - a.x - (b.y - b.x));
  return [sum[0], diff[0], sum[3], diff[3]];
}

/** 台形補正（四隅を長方形に引き伸ばす） */
export async function warpPerspective(src: HTMLCanvasElement, corners: Pt[], maxSide = 2000): Promise<HTMLCanvasElement> {
  const cv = await loadCv();
  const P = corners.map((c) => ({ x: c.x * src.width, y: c.y * src.height }));
  const d = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
  let w = Math.max(d(P[0], P[1]), d(P[3], P[2]));
  let h = Math.max(d(P[0], P[3]), d(P[1], P[2]));
  const s = maxSide / Math.max(w, h);
  w = Math.round(w * s);
  h = Math.round(h * s);
  const img = cv.imread(src);
  const dst = new cv.Mat();
  const from = cv.matFromArray(4, 1, cv.CV_32FC2, P.flatMap((p) => [p.x, p.y]));
  const to = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, w, 0, w, h, 0, h]);
  const M = cv.getPerspectiveTransform(from, to);
  cv.warpPerspective(img, dst, M, new cv.Size(w, h), cv.INTER_CUBIC, cv.BORDER_REPLICATE);
  const out = newCanvas(w, h);
  cv.imshow(out, dst);
  [img, dst, from, to, M].forEach((x) => x.delete());
  return out;
}

export interface CleanParams {
  /** 傾き自動補正 */
  deskew: boolean;
  /** 影の除去 0-100 */
  shadow: number;
  /** 背景の白化 0-100 */
  whiten: number;
  /** 二値化 */
  binarize: boolean;
  /** 二値化のしきい値の強さ 0-100（大きいほど薄い線も黒く） */
  threshold: number;
  /** ノイズ除去 0-100 */
  denoise: number;
  /** 線のなめらか化 0-100 */
  smooth: number;
  /** シャープ化 0-100 */
  sharpen: number;
}

export const DEFAULT_CLEAN: CleanParams = {
  deskew: true,
  shadow: 70,
  whiten: 50,
  binarize: true,
  threshold: 50,
  denoise: 50,
  smooth: 40,
  sharpen: 30,
};

/** 傾き角度（度）を罫線・文字の並びから推定 */
function estimateSkew(cv: CV, gray: any): number {
  const edges = new cv.Mat();
  const lines = new cv.Mat();
  try {
    cv.Canny(gray, edges, 50, 150);
    const minLen = Math.round(gray.cols * 0.15);
    cv.HoughLinesP(edges, lines, 1, Math.PI / 720, 80, minLen, 10);
    const angles: number[] = [];
    for (let i = 0; i < lines.rows; i++) {
      const [x1, y1, x2, y2] = lines.data32S.slice(i * 4, i * 4 + 4);
      const a = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
      if (Math.abs(a) < 10) angles.push(a);
      else if (Math.abs(Math.abs(a) - 90) < 10) angles.push(a > 0 ? a - 90 : a + 90);
    }
    if (angles.length < 3) return 0;
    angles.sort((a, b) => a - b);
    return angles[Math.floor(angles.length / 2)];
  } finally {
    edges.delete();
    lines.delete();
  }
}

/** モードA「写真補正」：影除去・白化・二値化・ノイズ除去・なめらか化・シャープ化 */
export async function cleanPhoto(src: HTMLCanvasElement, p: CleanParams): Promise<HTMLCanvasElement> {
  const cv = await loadCv();
  const mats: any[] = [];
  const m = <T>(x: T) => (mats.push(x), x);
  try {
    const rgba = m(cv.imread(src));
    let gray = m(new cv.Mat());
    cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);

    // 傾き補正
    if (p.deskew) {
      const angle = estimateSkew(cv, gray);
      if (Math.abs(angle) > 0.15) {
        const M = m(cv.getRotationMatrix2D(new cv.Point(gray.cols / 2, gray.rows / 2), angle, 1));
        const rot = m(new cv.Mat());
        cv.warpAffine(gray, rot, M, new cv.Size(gray.cols, gray.rows), cv.INTER_CUBIC, cv.BORDER_REPLICATE);
        gray = rot;
      }
    }

    // 影の除去：大きく膨張＋ぼかしで背景（紙の明るさのムラ）を推定し、割り算で平らにする
    if (p.shadow > 0) {
      const k = odd(Math.max(gray.cols, gray.rows) / 60);
      const bg = m(new cv.Mat());
      const kernel = m(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(k, k)));
      cv.dilate(gray, bg, kernel);
      cv.medianBlur(bg, bg, odd(k * 1.5 > 255 ? 255 : k * 1.5));
      const norm = m(new cv.Mat());
      cv.divide(gray, bg, norm, 255);
      const a = p.shadow / 100;
      const mix = m(new cv.Mat());
      cv.addWeighted(norm, a, gray, 1 - a, 0, mix);
      gray = mix;
    }

    // 背景の白化（明るい部分を真っ白に、暗い部分をより黒く）
    if (p.whiten > 0) {
      const white = 255 - p.whiten * 0.9;
      const black = p.whiten * 0.4;
      const lut = new Uint8Array(256);
      for (let v = 0; v < 256; v++) lut[v] = Math.max(0, Math.min(255, ((v - black) * 255) / (white - black)));
      const lutMat = m(cv.matFromArray(1, 256, cv.CV_8U, Array.from(lut)));
      const out = m(new cv.Mat());
      cv.LUT(gray, lutMat, out);
      gray = out;
    }

    // ノイズ除去（二値化前）
    if (p.denoise > 0) {
      const out = m(new cv.Mat());
      cv.medianBlur(gray, out, p.denoise > 60 ? 5 : 3);
      gray = out;
    }

    // シャープ化（アンシャープマスク）
    if (p.sharpen > 0 && !p.binarize) {
      const blur = m(new cv.Mat());
      cv.GaussianBlur(gray, blur, new cv.Size(0, 0), 2);
      const a = (p.sharpen / 100) * 1.5;
      const out = m(new cv.Mat());
      cv.addWeighted(gray, 1 + a, blur, -a, 0, out);
      gray = out;
    }

    if (p.binarize) {
      // シャープ化してから適応的二値化
      if (p.sharpen > 0) {
        const blur = m(new cv.Mat());
        cv.GaussianBlur(gray, blur, new cv.Size(0, 0), 1.5);
        const a = (p.sharpen / 100) * 1.2;
        const out = m(new cv.Mat());
        cv.addWeighted(gray, 1 + a, blur, -a, 0, out);
        gray = out;
      }
      const bin = m(new cv.Mat());
      const block = odd(Math.max(gray.cols, gray.rows) / 50);
      const C = 22 - (p.threshold / 100) * 18;
      cv.adaptiveThreshold(gray, bin, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, block, C);

      // 小さな点（ゴミ）の除去
      if (p.denoise > 0) {
        const inv = m(new cv.Mat());
        cv.bitwise_not(bin, inv);
        const labels = m(new cv.Mat());
        const stats = m(new cv.Mat());
        const cents = m(new cv.Mat());
        const n = cv.connectedComponentsWithStats(inv, labels, stats, cents, 8, cv.CV_32S);
        const minArea = Math.round((p.denoise / 100) * Math.max(gray.cols, gray.rows) * 0.012) + 1;
        const remove = new Uint8Array(n);
        for (let i = 1; i < n; i++) if (stats.intAt(i, cv.CC_STAT_AREA) < minArea) remove[i] = 1;
        const L = labels.data32S;
        const B = bin.data;
        for (let i = 0; i < L.length; i++) if (remove[L[i]]) B[i] = 255;
      }

      // 線のなめらか化：少しぼかして再度しきい値 → ガタガタを均し、最後に軽く輪郭をなめらかに
      if (p.smooth > 0) {
        const s = 0.6 + (p.smooth / 100) * 1.6;
        const blur = m(new cv.Mat());
        cv.GaussianBlur(bin, blur, new cv.Size(0, 0), s);
        const re = m(new cv.Mat());
        cv.threshold(blur, re, 150, 255, cv.THRESH_BINARY);
        const aa = m(new cv.Mat());
        cv.GaussianBlur(re, aa, new cv.Size(3, 3), 0.7);
        gray = aa;
      } else {
        gray = bin;
      }
    }

    const out = newCanvas(gray.cols, gray.rows);
    cv.imshow(out, gray);
    return out;
  } finally {
    mats.forEach((x) => x.delete?.());
  }
}

export interface DetectedLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
}

/**
 * モードB：罫線・枠の検出。
 * 横線・縦線それぞれを形態学処理で取り出し、近い線をまとめ、端点を交点に揃える。
 * 戻り値はピクセル座標の線と、罫線を消した文字だけの画像（OCR用）。
 */
export async function detectTableLines(src: HTMLCanvasElement): Promise<{ lines: DetectedLine[]; textOnly: HTMLCanvasElement }> {
  const cv = await loadCv();
  const mats: any[] = [];
  const m = <T>(x: T) => (mats.push(x), x);
  try {
    const rgba = m(cv.imread(src));
    const gray = m(new cv.Mat());
    cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
    const inv = m(new cv.Mat());
    cv.adaptiveThreshold(gray, inv, 255, cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY_INV, odd(gray.cols / 60), 12);
    const W = gray.cols;
    const H = gray.rows;

    const extract = (horizontal: boolean) => {
      const len = Math.round((horizontal ? W : H) / 28);
      const k = m(cv.getStructuringElement(cv.MORPH_RECT, horizontal ? new cv.Size(len, 1) : new cv.Size(1, len)));
      const out = m(new cv.Mat());
      cv.morphologyEx(inv, out, cv.MORPH_OPEN, k);
      // 途切れた線をつなぐ
      const k2 = m(cv.getStructuringElement(cv.MORPH_RECT, horizontal ? new cv.Size(Math.round(len / 3), 1) : new cv.Size(1, Math.round(len / 3))));
      cv.morphologyEx(out, out, cv.MORPH_CLOSE, k2);
      return out;
    };
    const hMask = extract(true);
    const vMask = extract(false);

    const toLines = (mask: any, horizontal: boolean): DetectedLine[] => {
      const contours = m(new cv.MatVector());
      const hier = m(new cv.Mat());
      cv.findContours(mask, contours, hier, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
      const res: DetectedLine[] = [];
      for (let i = 0; i < contours.size(); i++) {
        const c = contours.get(i);
        const r = cv.boundingRect(c);
        c.delete();
        if (horizontal) {
          if (r.width < W * 0.03 || r.height > H * 0.02) continue;
          const y = r.y + r.height / 2;
          res.push({ x1: r.x, y1: y, x2: r.x + r.width, y2: y, width: Math.max(1, Math.min(r.height, 6)) });
        } else {
          if (r.height < H * 0.02 || r.width > W * 0.02) continue;
          const x = r.x + r.width / 2;
          res.push({ x1: x, y1: r.y, x2: x, y2: r.y + r.height, width: Math.max(1, Math.min(r.width, 6)) });
        }
      }
      return res;
    };

    let hs = mergeLines(toLines(hMask, true), true, H * 0.006, W * 0.01);
    let vs = mergeLines(toLines(vMask, false), false, W * 0.006, H * 0.01);
    const snapD = Math.max(W, H) * 0.012;
    hs = hs.map((l) => snapEnds(l, vs, true, snapD));
    vs = vs.map((l) => snapEnds(l, hs, false, snapD));

    // 文字だけの画像（罫線を白で消す）
    const lineMask = m(new cv.Mat());
    cv.bitwise_or(hMask, vMask, lineMask);
    const k3 = m(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3)));
    cv.dilate(lineMask, lineMask, k3);
    const textGray = m(new cv.Mat());
    cv.bitwise_not(inv, textGray);
    textGray.setTo(new cv.Scalar(255), lineMask);
    const textOnly = newCanvas(W, H);
    cv.imshow(textOnly, textGray);

    return { lines: [...hs, ...vs], textOnly };
  } finally {
    mats.forEach((x) => x.delete?.());
  }
}

function mergeLines(ls: DetectedLine[], horizontal: boolean, posTol: number, gapTol: number): DetectedLine[] {
  const pos = (l: DetectedLine) => (horizontal ? l.y1 : l.x1);
  const a0 = (l: DetectedLine) => (horizontal ? l.x1 : l.y1);
  const a1 = (l: DetectedLine) => (horizontal ? l.x2 : l.y2);
  const sorted = [...ls].sort((a, b) => pos(a) - pos(b) || a0(a) - a0(b));
  const groups: DetectedLine[][] = [];
  for (const l of sorted) {
    const g = groups.find((g) => Math.abs(pos(g[0]) - pos(l)) <= posTol);
    if (g) g.push(l);
    else groups.push([l]);
  }
  const out: DetectedLine[] = [];
  for (const g of groups) {
    const p = g.reduce((s, l) => s + pos(l), 0) / g.length;
    const w = g.reduce((s, l) => s + l.width, 0) / g.length;
    const segs = g.map((l) => [a0(l), a1(l)] as [number, number]).sort((a, b) => a[0] - b[0]);
    let cur = segs[0];
    const flush = (s: [number, number]) =>
      out.push(horizontal ? { x1: s[0], y1: p, x2: s[1], y2: p, width: w } : { x1: p, y1: s[0], x2: p, y2: s[1], width: w });
    for (const s of segs.slice(1)) {
      if (s[0] <= cur[1] + gapTol) cur = [cur[0], Math.max(cur[1], s[1])];
      else {
        flush(cur);
        cur = s;
      }
    }
    flush(cur);
  }
  return out;
}

/** 線の端を、交わる線の位置にぴったり揃える */
function snapEnds(l: DetectedLine, others: DetectedLine[], horizontal: boolean, tol: number): DetectedLine {
  const r = { ...l };
  for (const o of others) {
    if (horizontal) {
      const inRange = l.y1 >= Math.min(o.y1, o.y2) - tol && l.y1 <= Math.max(o.y1, o.y2) + tol;
      if (!inRange) continue;
      if (Math.abs(o.x1 - l.x1) < tol) r.x1 = o.x1;
      if (Math.abs(o.x1 - l.x2) < tol) r.x2 = o.x1;
    } else {
      const inRange = l.x1 >= Math.min(o.x1, o.x2) - tol && l.x1 <= Math.max(o.x1, o.x2) + tol;
      if (!inRange) continue;
      if (Math.abs(o.y1 - l.y1) < tol) r.y1 = o.y1;
      if (Math.abs(o.y1 - l.y2) < tol) r.y2 = o.y1;
    }
  }
  return r;
}

export { cloneCanvas };
