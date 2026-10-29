import { clamp, newId } from './id';
import { sampleBackground } from './image';
import type { Annotation, Rect } from '../types';

/**
 * 画像上の文字・数字・手書き部分をOCRで検出する
 */
export interface DetectedTextRegion {
  rect: Rect;
  text: string;
  isNumericOrHandwriting: boolean;
}

export async function detectTextRegionsToErase(
  canvas: HTMLCanvasElement,
  onlyNumbers = true,
  onProgress?: (msg: string) => void,
): Promise<DetectedTextRegion[]> {
  onProgress?.('文字・数字を解析中…');
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('jpn', 1);
  const regions: DetectedTextRegion[] = [];
  const W = canvas.width;
  const H = canvas.height;

  try {
    const res = await worker.recognize(canvas, {}, { blocks: true, text: true });
    const blocks = res.data.blocks ?? [];
    for (const b of blocks) {
      for (const p of b.paragraphs ?? []) {
        for (const ln of p.lines ?? []) {
          for (const w of ln.words ?? []) {
            const raw = w.text.trim();
            if (!raw) continue;
            // 数字、記号、金額、短い手書き数字などの判定
            const isNum = /^[\d\s,.\-¥￥円/()（）:：+＋]+$/.test(raw) || (raw.length <= 4 && /\d/.test(raw));
            if (onlyNumbers && !isNum) continue;

            const bw = w.bbox.x1 - w.bbox.x0;
            const bh = w.bbox.y1 - w.bbox.y0;
            if (bw <= 2 || bh <= 2 || bw > W * 0.8 || bh > H * 0.3) continue;

            regions.push({
              rect: {
                x: clamp((w.bbox.x0 - 4) / W, 0, 1),
                y: clamp((w.bbox.y0 - 3) / H, 0, 1),
                w: clamp((bw + 8) / W, 0.01, 1),
                h: clamp((bh + 6) / H, 0.01, 1),
              },
              text: raw,
              isNumericOrHandwriting: isNum,
            });
          }
        }
      }
    }
  } finally {
    await worker.terminate();
  }

  return regions;
}

/**
 * 検出された領域から白消し（マスク）アノテーションを生成する
 */
export function createEraseAnnotations(
  canvas: HTMLCanvasElement,
  regions: Rect[],
  pageIndex: number,
): Annotation[] {
  return regions.map((r) => {
    const maskColor = sampleBackground(
      canvas,
      r.x * canvas.width,
      r.y * canvas.height,
      r.w * canvas.width,
      r.h * canvas.height,
    );
    return {
      id: newId(),
      page: pageIndex,
      rect: r,
      maskColor,
      text: '', // 白紙化（文字なし）
      fontSize: 0.02,
      textColor: '#000000',
      bold: false,
      align: 'left',
    };
  });
}
