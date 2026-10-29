import type { BlobStore, TemplateRepository } from '../repo/types';
import type { FieldDef, NewTemplate } from '../types';
import { FONT_STACK, ensureCanvasFonts } from './fonts';
import { newId } from './id';
import { canvasToBlob, makeThumb, newCanvas } from './image';

/**
 * 現場ですぐ試せる「バス乗務精算書・日報」のサンプル空白テンプレートを生成する。
 * withShadow=true の場合は、写真補正（モードA・モードB）の体験用に少し影・傾きを付けた写真風テンプレートを作る。
 */
export async function createSampleSettlementTemplate(
  blobs: BlobStore,
  templates: TemplateRepository,
  withShadow = false,
) {
  await ensureCanvasFonts();
  const W = 1200;
  const H = 1700;
  const c = newCanvas(W, H);
  const ctx = c.getContext('2d')!;

  // 白紙背景
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  if (withShadow) {
    // 照明ムラ・影を再現（モードA「影の除去・白化」テスト用）
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#f6f5f0');
    grad.addColorStop(0.55, '#e8e6dc');
    grad.addColorStop(1, '#cbc8bc');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  ctx.strokeStyle = '#111111';
  ctx.fillStyle = '#111111';
  ctx.textBaseline = 'middle';

  // タイトル枠
  ctx.font = `700 44px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.fillText('バス乗務精算書・日報', W / 2, 110);

  // 外枠と基本情報表 (y: 170 - 390)
  const L = 80;
  const R = W - 80;
  const TW = R - L;

  const drawBox = (x: number, y: number, w: number, h: number, lw = 3) => {
    ctx.lineWidth = lw;
    ctx.strokeRect(x, y, w, h);
  };
  const hLine = (x1: number, x2: number, y: number, lw = 2) => {
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.stroke();
  };
  const vLine = (x: number, y1: number, y2: number, lw = 2) => {
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(x, y1);
    ctx.lineTo(x, y2);
    ctx.stroke();
  };

  drawBox(L, 180, TW, 220, 3);
  hLine(L, R, 290, 2);
  vLine(L + 180, 180, 400, 2);
  vLine(L + 520, 180, 400, 2);
  vLine(L + 700, 180, 400, 2);

  ctx.font = `700 26px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.fillText('運行日', L + 90, 235);
  ctx.fillText('車両番号', L + 610, 235);
  ctx.fillText('乗務員氏名', L + 90, 345);
  ctx.fillText('出庫 / 入庫', L + 610, 345);
  ctx.font = `400 24px ${FONT_STACK}`;
  ctx.fillText('〜', L + 870, 345);

  // 精算明細表 (y: 450 - 1350)
  drawBox(L, 450, TW, 900, 3);
  const rows = [
    { y: 450, h: 90, label: '項　　目', note: '備　考', header: true },
    { y: 540, h: 115, label: '① 運賃収入', note: '現金・回数券計' },
    { y: 655, h: 115, label: '② 高速道路代', note: '領収書添付' },
    { y: 770, h: 115, label: '③ 駐車場代', note: '領収書添付' },
    { y: 885, h: 115, label: '④ 燃料・立替他', note: '給油・その他立替' },
    { y: 1000, h: 115, label: '⑤ 立替経費合計', note: '②＋③＋④（自動計算）' },
    { y: 1115, h: 120, label: '⑥ 差引納金額', note: '①−⑤（自動計算）', bold: true },
    { y: 1235, h: 115, label: '連絡・特記事項', note: '' },
  ];

  vLine(L + 300, 450, 1350, 2);
  vLine(L + 740, 450, 1235, 2);

  for (const r of rows) {
    if (r.y > 450) hLine(L, R, r.y, r.bold ? 3 : 2);
    const cy = r.y + r.h / 2;
    ctx.font = `${r.header || r.bold ? 700 : 400} 27px ${FONT_STACK}`;
    ctx.textAlign = r.header ? 'center' : 'left';
    ctx.fillText(r.label, r.header ? L + 150 : L + 24, cy);
    if (r.header) {
      ctx.fillText('金　額（円）', L + 520, cy);
      ctx.fillText(r.note, L + 890, cy);
    } else if (r.note) {
      ctx.font = `400 22px ${FONT_STACK}`;
      ctx.textAlign = 'left';
      ctx.fillText(r.note, L + 760, cy);
    }
  }

  // 確認印枠
  drawBox(R - 360, 1400, 360, 190, 2);
  hLine(R - 360, R, 1455, 2);
  vLine(R - 180, 1400, 1590, 2);
  ctx.font = `700 22px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.fillText('運行管理者', R - 270, 1428);
  ctx.fillText('精算係', R - 90, 1428);

  const bgBlob = await canvasToBlob(c, 'image/jpeg', 0.9);
  const thumbBlob = await makeThumb(c);
  const bgBlobId = await blobs.put(bgBlob);
  const thumbBlobId = await blobs.put(thumbBlob);

  // 入力欄（すべて比率座標 0〜1）
  const idFare = newId();
  const idHighway = newId();
  const idPark = newId();
  const idFuel = newId();
  const idExpTotal = newId();
  const idNetTotal = newId();

  const fields: FieldDef[] = [
    {
      id: newId(),
      page: 0,
      rect: { x: (L + 190) / W, y: 195 / H, w: 320 / W, h: 80 / H },
      label: '運行日',
      type: 'date',
      required: true,
      align: 'center',
    },
    {
      id: newId(),
      page: 0,
      rect: { x: (L + 710) / W, y: 195 / H, w: 320 / W, h: 80 / H },
      label: '車両番号',
      type: 'number',
      required: true,
      maxDigits: 6,
      comma: false,
      align: 'center',
    },
    {
      id: newId(),
      page: 0,
      rect: { x: (L + 190) / W, y: 305 / H, w: 320 / W, h: 80 / H },
      label: '乗務員氏名',
      type: 'text',
      required: true,
      align: 'center',
    },
    {
      id: newId(),
      page: 0,
      rect: { x: (L + 710) / W, y: 305 / H, w: 140 / W, h: 80 / H },
      label: '出庫時間',
      type: 'time',
      required: false,
      align: 'center',
    },
    {
      id: newId(),
      page: 0,
      rect: { x: (L + 890) / W, y: 305 / H, w: 140 / W, h: 80 / H },
      label: '入庫時間',
      type: 'time',
      required: false,
      align: 'center',
    },
    {
      id: idFare,
      page: 0,
      rect: { x: (L + 315) / W, y: 558 / H, w: 410 / W, h: 80 / H },
      label: '運賃収入',
      type: 'currency',
      required: true,
      maxDigits: 8,
      comma: true,
      align: 'right',
    },
    {
      id: idHighway,
      page: 0,
      rect: { x: (L + 315) / W, y: 673 / H, w: 410 / W, h: 80 / H },
      label: '高速代',
      type: 'currency',
      required: false,
      maxDigits: 7,
      comma: true,
      align: 'right',
    },
    {
      id: idPark,
      page: 0,
      rect: { x: (L + 315) / W, y: 788 / H, w: 410 / W, h: 80 / H },
      label: '駐車代',
      type: 'currency',
      required: false,
      maxDigits: 7,
      comma: true,
      align: 'right',
    },
    {
      id: idFuel,
      page: 0,
      rect: { x: (L + 315) / W, y: 903 / H, w: 410 / W, h: 80 / H },
      label: '燃料・立替',
      type: 'currency',
      required: false,
      maxDigits: 7,
      comma: true,
      align: 'right',
    },
    {
      id: idExpTotal,
      page: 0,
      rect: { x: (L + 315) / W, y: 1018 / H, w: 410 / W, h: 80 / H },
      label: '立替経費合計',
      type: 'currency',
      required: false,
      comma: true,
      align: 'right',
      formula: [
        { fieldId: idHighway, op: '+' },
        { fieldId: idPark, op: '+' },
        { fieldId: idFuel, op: '+' },
      ],
    },
    {
      id: idNetTotal,
      page: 0,
      rect: { x: (L + 315) / W, y: 1135 / H, w: 410 / W, h: 84 / H },
      label: '差引納金額（合計）',
      type: 'currency',
      required: false,
      comma: true,
      align: 'right',
      formula: [
        { fieldId: idFare, op: '+' },
        { fieldId: idExpTotal, op: '-' },
      ],
    },
    {
      id: newId(),
      page: 0,
      rect: { x: (L + 315) / W, y: 1252 / H, w: 710 / W, h: 80 / H },
      label: '連絡・特記事項',
      type: 'text',
      required: false,
      align: 'left',
    },
  ];

  const nt: NewTemplate = {
    name: withShadow ? '乗務精算書（写真サンプル）' : 'バス乗務精算書・日報',
    kind: 'photo',
    pages: [{ index: 0, width: W, height: H, bgBlobId }],
    sourceBlobId: bgBlobId,
    sourceMime: 'image/jpeg',
    thumbBlobId,
    fields,
    annotations: [],
  };

  return templates.create(nt);
}
