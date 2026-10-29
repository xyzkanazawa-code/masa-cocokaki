import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PdfTextItem } from '../types';
import { canvasToBlob } from './image';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface RenderedPdfPage {
  blob: Blob;
  width: number;
  height: number;
  pdfWidth: number;
  pdfHeight: number;
  textItems: PdfTextItem[];
}

/** PDF の各ページを表示用の画像にし、テキストレイヤー（文字と位置）も取り出す */
export async function renderPdf(
  file: Blob,
  longSide = 2000,
  onProgress?: (done: number, total: number) => void,
): Promise<RenderedPdfPage[]> {
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const out: RenderedPdfPage[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const scale = longSide / Math.max(base.width, base.height);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;

    const tc = await page.getTextContent();
    const textItems: PdfTextItem[] = [];
    for (const it of tc.items) {
      if (!('str' in it) || !it.str.trim()) continue;
      const tx = pdfjs.Util.transform(vp.transform, it.transform);
      const fh = Math.hypot(tx[2], tx[3]);
      const w = it.width * scale;
      textItems.push({
        str: it.str,
        rect: {
          x: tx[4] / vp.width,
          y: (tx[5] - fh) / vp.height,
          w: w / vp.width,
          h: (fh * 1.2) / vp.height,
        },
      });
    }
    out.push({
      blob: await canvasToBlob(canvas, 'image/jpeg', 0.9),
      width: canvas.width,
      height: canvas.height,
      pdfWidth: base.width,
      pdfHeight: base.height,
      textItems,
    });
    onProgress?.(i, doc.numPages);
  }
  await doc.cleanup();
  return out;
}
