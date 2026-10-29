import type { Annotation, FieldDef, RebuildPage, Rect, Template } from '../types';
import { FONT_STACK, ensureCanvasFonts } from './fonts';
import { formatValue } from './format';
import { loadImage, newCanvas } from './image';

export interface DrawTextOpts {
  text: string;
  rect: Rect;
  W: number;
  H: number;
  /** ページ幅に対する比率。未指定なら欄の高さから自動 */
  fontSize?: number;
  color?: string;
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
}

/** 欄の高さから自動で決める文字サイズ（ページ幅比） */
export function autoFontSize(rect: Rect, W: number, H: number): number {
  return (rect.h * H * 0.62) / W;
}

/** 四角の中に文字を描く（はみ出す場合は縮小） */
export function drawTextInRect(ctx: CanvasRenderingContext2D, o: DrawTextOpts) {
  if (!o.text) return;
  const x = o.rect.x * o.W;
  const y = o.rect.y * o.H;
  const w = o.rect.w * o.W;
  const h = o.rect.h * o.H;
  let px = (o.fontSize ?? autoFontSize(o.rect, o.W, o.H)) * o.W;
  const weight = o.bold ? '700' : '400';
  ctx.font = `${weight} ${px}px ${FONT_STACK}`;
  const pad = Math.min(w * 0.04, px * 0.25);
  const tw = ctx.measureText(o.text).width;
  if (tw > w - pad * 2) {
    px = Math.max(4, px * ((w - pad * 2) / tw));
    ctx.font = `${weight} ${px}px ${FONT_STACK}`;
  }
  ctx.fillStyle = o.color ?? '#000';
  ctx.textBaseline = 'middle';
  const align = o.align ?? 'left';
  ctx.textAlign = align;
  const tx = align === 'left' ? x + pad : align === 'right' ? x + w - pad : x + w / 2;
  ctx.fillText(o.text, tx, y + h / 2 + px * 0.05);
}

export function drawAnnotations(ctx: CanvasRenderingContext2D, anns: Annotation[], W: number, H: number) {
  for (const a of anns) {
    if (a.maskColor) {
      ctx.fillStyle = a.maskColor;
      ctx.fillRect(a.rect.x * W, a.rect.y * H, a.rect.w * W, a.rect.h * H);
    }
    drawTextInRect(ctx, {
      text: a.text,
      rect: a.rect,
      W,
      H,
      fontSize: a.fontSize,
      color: a.textColor,
      bold: a.bold,
      align: a.align,
    });
  }
}

export function drawRebuild(ctx: CanvasRenderingContext2D, rp: RebuildPage, W: number, H: number) {
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#000';
  ctx.lineCap = 'square';
  for (const l of rp.lines) {
    ctx.lineWidth = Math.max(1, l.width * W);
    ctx.beginPath();
    ctx.moveTo(l.x1 * W, l.y1 * H);
    ctx.lineTo(l.x2 * W, l.y2 * H);
    ctx.stroke();
  }
  for (const t of rp.texts) {
    drawTextInRect(ctx, { text: t.text, rect: t.rect, W, H, fontSize: t.fontSize, bold: t.bold, align: t.align });
  }
}

export function drawValues(
  ctx: CanvasRenderingContext2D,
  fields: FieldDef[],
  values: Record<string, string>,
  page: number,
  W: number,
  H: number,
) {
  for (const f of fields) {
    if (f.page !== page) continue;
    const text = formatValue(f, values[f.id]);
    drawTextInRect(ctx, {
      text,
      rect: f.rect,
      W,
      H,
      fontSize: f.fontSize,
      color: '#0b1f6b',
      align: f.align,
    });
  }
}

/**
 * テンプレートのページを新しいキャンバスに描く（元の画像は変更しない）。
 * values を渡すと入力内容も重ねる。
 */
export async function renderPage(
  t: Template,
  pageIndex: number,
  bg: Blob,
  values?: Record<string, string>,
): Promise<HTMLCanvasElement> {
  await ensureCanvasFonts();
  const p = t.pages[pageIndex];
  const c = newCanvas(p.width, p.height);
  const ctx = c.getContext('2d')!;
  const rp = t.rebuild?.find((r) => r.page === pageIndex);
  if (t.kind === 'rebuilt' && rp) {
    drawRebuild(ctx, rp, c.width, c.height);
  } else {
    const img = await loadImage(bg);
    ctx.drawImage(img, 0, 0, c.width, c.height);
  }
  drawAnnotations(
    ctx,
    t.annotations.filter((a) => a.page === pageIndex),
    c.width,
    c.height,
  );
  if (values) drawValues(ctx, t.fields, values, pageIndex, c.width, c.height);
  return c;
}
