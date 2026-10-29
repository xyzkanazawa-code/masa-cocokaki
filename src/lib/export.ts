import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { BlobStore } from '../repo/types';
import type { Rect, Template } from '../types';
import { computeAll } from './calc';
import { fontBytes } from './fonts';
import { formatValue } from './format';
import { canvasToBlob } from './image';
import { autoFontSize, renderPage } from './render';

function hexToRgb(hex: string) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return rgb(0, 0, 0);
  return rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255);
}

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

function drawTextPdf(
  page: PDFPage,
  fonts: Fonts,
  o: { text: string; rect: Rect; fontSize?: number; color?: string; bold?: boolean; align?: 'left' | 'center' | 'right' },
  pxW: number,
  pxH: number,
) {
  if (!o.text) return;
  const { width: W, height: H } = page.getSize();
  const font = o.bold ? fonts.bold : fonts.regular;
  const x = o.rect.x * W;
  const w = o.rect.w * W;
  const h = o.rect.h * H;
  let size = (o.fontSize ?? autoFontSize(o.rect, pxW, pxH)) * W;
  const pad = Math.min(w * 0.04, size * 0.25);
  const tw = font.widthOfTextAtSize(o.text, size);
  if (tw > w - pad * 2) size = Math.max(3, size * ((w - pad * 2) / tw));
  const textW = font.widthOfTextAtSize(o.text, size);
  const align = o.align ?? 'left';
  const tx = align === 'left' ? x + pad : align === 'right' ? x + w - pad - textW : x + (w - textW) / 2;
  const centerY = H - (o.rect.y * H + h / 2);
  page.drawText(o.text, { x: tx, y: centerY - size * 0.36, size, font, color: hexToRgb(o.color ?? '#000000') });
}

/**
 * 完成版PDFを作る。
 * PDFテンプレートは元PDFを読み込んだ「コピー」に重ね書きする（元のファイルは変更しない）。
 */
export async function exportPdf(t: Template, rawValues: Record<string, string>, blobs: BlobStore): Promise<Blob> {
  const values = computeAll(t.fields, rawValues);
  let doc: PDFDocument;
  if (t.kind === 'pdf' && t.sourceBlobId) {
    const src = await blobs.get(t.sourceBlobId);
    doc = await PDFDocument.load(await src.arrayBuffer(), { ignoreEncryption: true });
  } else {
    doc = await PDFDocument.create();
  }
  doc.registerFontkit(fontkit);
  const fonts: Fonts = {
    regular: await doc.embedFont(await fontBytes('regular'), { subset: true }),
    bold: await doc.embedFont(await fontBytes('bold'), { subset: true }),
  };
  doc.setTitle(t.name);
  doc.setCreator('ココカキ');

  for (let i = 0; i < t.pages.length; i++) {
    const p = t.pages[i];
    let page: PDFPage;
    if (t.kind === 'pdf' && t.sourceBlobId) {
      page = doc.getPage(i);
    } else {
      // 写真・作り直し：用紙サイズ指定（mm）があればそのサイズに合わせる。未指定時はA4比率
      let W: number;
      let H: number;
      if (p.widthMm && p.heightMm) {
        W = (p.widthMm * 72) / 25.4;
        H = (p.heightMm * 72) / 25.4;
      } else {
        const landscape = p.width > p.height;
        W = landscape ? 841.89 : 595.28;
        H = (W * p.height) / p.width;
      }
      page = doc.addPage([W, H]);
      const rp = t.rebuild?.find((r) => r.page === i);
      if (t.kind === 'rebuilt' && rp) {
        for (const l of rp.lines) {
          page.drawLine({
            start: { x: l.x1 * W, y: H - l.y1 * H },
            end: { x: l.x2 * W, y: H - l.y2 * H },
            thickness: Math.max(0.3, l.width * W),
            color: rgb(0, 0, 0),
            lineCap: 2,
          });
        }
        for (const tx of rp.texts) drawTextPdf(page, fonts, tx, p.width, p.height);
      } else {
        const bg = await blobs.get(p.bgBlobId);
        const bytes = await bg.arrayBuffer();
        const img = bg.type === 'image/png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        page.drawImage(img, { x: 0, y: 0, width: W, height: H });
      }
    }
    const { width: W, height: H } = page.getSize();
    for (const a of t.annotations.filter((x) => x.page === i)) {
      if (a.maskColor) {
        page.drawRectangle({
          x: a.rect.x * W,
          y: H - (a.rect.y + a.rect.h) * H,
          width: a.rect.w * W,
          height: a.rect.h * H,
          color: hexToRgb(a.maskColor),
        });
      }
      drawTextPdf(page, fonts, { ...a, color: a.textColor }, p.width, p.height);
    }
    for (const f of t.fields.filter((x) => x.page === i)) {
      drawTextPdf(
        page,
        fonts,
        { text: formatValue(f, values[f.id]), rect: f.rect, fontSize: f.fontSize, color: '#0b1f6b', align: f.align },
        p.width,
        p.height,
      );
    }
  }
  const bytes = await doc.save();
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
}

/** 完成版の画像（ページごと）を作る */
export async function exportImages(
  t: Template,
  rawValues: Record<string, string>,
  blobs: BlobStore,
  type: 'image/png' | 'image/jpeg',
): Promise<Blob[]> {
  const values = computeAll(t.fields, rawValues);
  const out: Blob[] = [];
  for (let i = 0; i < t.pages.length; i++) {
    const bg = await blobs.get(t.pages[i].bgBlobId);
    const c = await renderPage(t, i, bg, values);
    if (type === 'image/jpeg') {
      // JPEG は透明を扱えないので白背景に
      const ctx = c.getContext('2d')!;
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
    }
    out.push(await canvasToBlob(c, type, 0.92));
  }
  return out;
}

export function safeFileName(s: string): string {
  return s.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60) || 'cocokaki';
}

/** 共有（LINE・メール・クラウド保存など）。非対応の端末ではダウンロード */
export async function shareOrDownload(files: File[], title: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files })) {
    try {
      await nav.share({ files, title });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
    }
  }
  files.forEach(download);
  return 'downloaded';
}

export function download(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** 印刷（アプリ内に印刷用の画像を並べて window.print） */
export async function printImages(blobs: Blob[]) {
  const holder = document.createElement('div');
  holder.id = 'print-root';
  const urls = blobs.map((b) => URL.createObjectURL(b));
  for (const u of urls) {
    const img = document.createElement('img');
    img.src = u;
    holder.appendChild(img);
  }
  document.body.appendChild(holder);
  await Promise.all([...holder.querySelectorAll('img')].map((i) => i.decode().catch(() => undefined)));
  const cleanup = () => {
    holder.remove();
    urls.forEach((u) => URL.revokeObjectURL(u));
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
  setTimeout(cleanup, 60_000);
}
