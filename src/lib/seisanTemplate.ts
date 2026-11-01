import type { BlobStore, TemplateRepository } from '../repo/types';
import type { FieldDef, FormulaTerm, NewTemplate } from '../types';
import { canvasToBlob, imageToCanvas, loadImage, makeThumb } from './image';
import { newId } from './id';
import { SEISAN_PNG_BASE64 } from './seisanImage';

function base64ToBlob(b64: string, mime = 'image/png'): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * 実物の精算表（空白・1面のみ、会社名なし）をテンプレートとして追加する。
 * 入力欄83件はスキャン画像の罫線から計測した座標で初期配置する。
 * 合計欄と残金は formula（自動計算）。座標はすべて比率（0〜1）。
 */

type FieldSpec = {
  key: string;
  label: string;
  type: FieldDef['type'];
  align: FieldDef['align'];
  rect: { x: number; y: number; w: number; h: number };
  /** 例: "kaiso_d1+kaiso_d2" / "yokin+tatekae-grand_total" */
  formula?: string;
};

const FIELD_SPECS: FieldSpec[] = [
  { key: 'dantai', label: '団体名', type: 'text', align: 'left', rect: { x: 0.15, y: 0.1077, w: 0.2931, h: 0.0402 } },
  { key: 'untenshu', label: '運転手', type: 'text', align: 'left', rect: { x: 0.5758, y: 0.1077, w: 0.1766, h: 0.0402 } },
  { key: 'shaban', label: '車番', type: 'text', align: 'left', rect: { x: 0.844, y: 0.1077, w: 0.1077, h: 0.0402 } },
  { key: 'date1', label: '日付1', type: 'date', align: 'center', rect: { x: 0.1524, y: 0.1728, w: 0.1089, h: 0.0527 } },
  { key: 'date2', label: '日付2', type: 'date', align: 'center', rect: { x: 0.2645, y: 0.1728, w: 0.1093, h: 0.0527 } },
  { key: 'date3', label: '日付3', type: 'date', align: 'center', rect: { x: 0.377, y: 0.1728, w: 0.1093, h: 0.0527 } },
  { key: 'date4', label: '日付4', type: 'date', align: 'center', rect: { x: 0.4895, y: 0.1728, w: 0.1101, h: 0.0527 } },
  { key: 'date5', label: '日付5', type: 'date', align: 'center', rect: { x: 0.6028, y: 0.1728, w: 0.1089, h: 0.0527 } },
  { key: 'date6', label: '日付6', type: 'date', align: 'center', rect: { x: 0.7149, y: 0.1728, w: 0.1077, h: 0.0527 } },
  { key: 'kaiso_d1', label: '回送代（1日目）', type: 'currency', align: 'right', rect: { x: 0.1524, y: 0.2302, w: 0.1089, h: 0.0527 } },
  { key: 'kaiso_d2', label: '回送代（2日目）', type: 'currency', align: 'right', rect: { x: 0.2645, y: 0.2302, w: 0.1093, h: 0.0527 } },
  { key: 'kaiso_d3', label: '回送代（3日目）', type: 'currency', align: 'right', rect: { x: 0.377, y: 0.2302, w: 0.1093, h: 0.0527 } },
  { key: 'kaiso_d4', label: '回送代（4日目）', type: 'currency', align: 'right', rect: { x: 0.4895, y: 0.2302, w: 0.1101, h: 0.0527 } },
  { key: 'kaiso_d5', label: '回送代（5日目）', type: 'currency', align: 'right', rect: { x: 0.6028, y: 0.2302, w: 0.1089, h: 0.0527 } },
  { key: 'kaiso_d6', label: '回送代（6日目）', type: 'currency', align: 'right', rect: { x: 0.7149, y: 0.2302, w: 0.1077, h: 0.0527 } },
  { key: 'kaiso_total', label: '回送代（合計）', type: 'currency', align: 'right', rect: { x: 0.8258, y: 0.2302, w: 0.1359, h: 0.0527 }, formula: 'kaiso_d1+kaiso_d2+kaiso_d3+kaiso_d4+kaiso_d5+kaiso_d6' },
  { key: 'etc_d1', label: '実車ETC代（1日目）', type: 'currency', align: 'right', rect: { x: 0.1524, y: 0.2876, w: 0.1089, h: 0.0521 } },
  { key: 'etc_d2', label: '実車ETC代（2日目）', type: 'currency', align: 'right', rect: { x: 0.2645, y: 0.2876, w: 0.1093, h: 0.0521 } },
  { key: 'etc_d3', label: '実車ETC代（3日目）', type: 'currency', align: 'right', rect: { x: 0.377, y: 0.2876, w: 0.1093, h: 0.0521 } },
  { key: 'etc_d4', label: '実車ETC代（4日目）', type: 'currency', align: 'right', rect: { x: 0.4895, y: 0.2876, w: 0.1101, h: 0.0521 } },
  { key: 'etc_d5', label: '実車ETC代（5日目）', type: 'currency', align: 'right', rect: { x: 0.6028, y: 0.2876, w: 0.1089, h: 0.0521 } },
  { key: 'etc_d6', label: '実車ETC代（6日目）', type: 'currency', align: 'right', rect: { x: 0.7149, y: 0.2876, w: 0.1077, h: 0.0521 } },
  { key: 'etc_total', label: '実車ETC代（合計）', type: 'currency', align: 'right', rect: { x: 0.8258, y: 0.2876, w: 0.1359, h: 0.0521 }, formula: 'etc_d1+etc_d2+etc_d3+etc_d4+etc_d5+etc_d6' },
  { key: 'chusha_d1', label: '駐車代（1日目）', type: 'currency', align: 'right', rect: { x: 0.1524, y: 0.3444, w: 0.1089, h: 0.0521 } },
  { key: 'chusha_d2', label: '駐車代（2日目）', type: 'currency', align: 'right', rect: { x: 0.2645, y: 0.3444, w: 0.1093, h: 0.0521 } },
  { key: 'chusha_d3', label: '駐車代（3日目）', type: 'currency', align: 'right', rect: { x: 0.377, y: 0.3444, w: 0.1093, h: 0.0521 } },
  { key: 'chusha_d4', label: '駐車代（4日目）', type: 'currency', align: 'right', rect: { x: 0.4895, y: 0.3444, w: 0.1101, h: 0.0521 } },
  { key: 'chusha_d5', label: '駐車代（5日目）', type: 'currency', align: 'right', rect: { x: 0.6028, y: 0.3444, w: 0.1089, h: 0.0521 } },
  { key: 'chusha_d6', label: '駐車代（6日目）', type: 'currency', align: 'right', rect: { x: 0.7149, y: 0.3444, w: 0.1077, h: 0.0521 } },
  { key: 'chusha_total', label: '駐車代（合計）', type: 'currency', align: 'right', rect: { x: 0.8258, y: 0.3444, w: 0.1359, h: 0.0521 }, formula: 'chusha_d1+chusha_d2+chusha_d3+chusha_d4+chusha_d5+chusha_d6' },
  { key: 'shokuji_d1', label: '食事代（1日目）', type: 'currency', align: 'right', rect: { x: 0.1524, y: 0.4012, w: 0.1089, h: 0.0521 } },
  { key: 'shokuji_d2', label: '食事代（2日目）', type: 'currency', align: 'right', rect: { x: 0.2645, y: 0.4012, w: 0.1093, h: 0.0521 } },
  { key: 'shokuji_d3', label: '食事代（3日目）', type: 'currency', align: 'right', rect: { x: 0.377, y: 0.4012, w: 0.1093, h: 0.0521 } },
  { key: 'shokuji_d4', label: '食事代（4日目）', type: 'currency', align: 'right', rect: { x: 0.4895, y: 0.4012, w: 0.1101, h: 0.0521 } },
  { key: 'shokuji_d5', label: '食事代（5日目）', type: 'currency', align: 'right', rect: { x: 0.6028, y: 0.4012, w: 0.1089, h: 0.0521 } },
  { key: 'shokuji_d6', label: '食事代（6日目）', type: 'currency', align: 'right', rect: { x: 0.7149, y: 0.4012, w: 0.1077, h: 0.0521 } },
  { key: 'shokuji_total', label: '食事代（合計）', type: 'currency', align: 'right', rect: { x: 0.8258, y: 0.4012, w: 0.1359, h: 0.0521 }, formula: 'shokuji_d1+shokuji_d2+shokuji_d3+shokuji_d4+shokuji_d5+shokuji_d6' },
  { key: 'ocha_d1', label: 'お茶代（1日目）', type: 'currency', align: 'right', rect: { x: 0.1524, y: 0.458, w: 0.1089, h: 0.0527 } },
  { key: 'ocha_d2', label: 'お茶代（2日目）', type: 'currency', align: 'right', rect: { x: 0.2645, y: 0.458, w: 0.1093, h: 0.0527 } },
  { key: 'ocha_d3', label: 'お茶代（3日目）', type: 'currency', align: 'right', rect: { x: 0.377, y: 0.458, w: 0.1093, h: 0.0527 } },
  { key: 'ocha_d4', label: 'お茶代（4日目）', type: 'currency', align: 'right', rect: { x: 0.4895, y: 0.458, w: 0.1101, h: 0.0527 } },
  { key: 'ocha_d5', label: 'お茶代（5日目）', type: 'currency', align: 'right', rect: { x: 0.6028, y: 0.458, w: 0.1089, h: 0.0527 } },
  { key: 'ocha_d6', label: 'お茶代（6日目）', type: 'currency', align: 'right', rect: { x: 0.7149, y: 0.458, w: 0.1077, h: 0.0527 } },
  { key: 'ocha_total', label: 'お茶代（合計）', type: 'currency', align: 'right', rect: { x: 0.8258, y: 0.458, w: 0.1359, h: 0.0527 }, formula: 'ocha_d1+ocha_d2+ocha_d3+ocha_d4+ocha_d5+ocha_d6' },
  { key: 'mizu_d1', label: '水代（1日目）', type: 'currency', align: 'right', rect: { x: 0.1524, y: 0.5154, w: 0.1089, h: 0.0521 } },
  { key: 'mizu_d2', label: '水代（2日目）', type: 'currency', align: 'right', rect: { x: 0.2645, y: 0.5154, w: 0.1093, h: 0.0521 } },
  { key: 'mizu_d3', label: '水代（3日目）', type: 'currency', align: 'right', rect: { x: 0.377, y: 0.5154, w: 0.1093, h: 0.0521 } },
  { key: 'mizu_d4', label: '水代（4日目）', type: 'currency', align: 'right', rect: { x: 0.4895, y: 0.5154, w: 0.1101, h: 0.0521 } },
  { key: 'mizu_d5', label: '水代（5日目）', type: 'currency', align: 'right', rect: { x: 0.6028, y: 0.5154, w: 0.1089, h: 0.0521 } },
  { key: 'mizu_d6', label: '水代（6日目）', type: 'currency', align: 'right', rect: { x: 0.7149, y: 0.5154, w: 0.1077, h: 0.0521 } },
  { key: 'mizu_total', label: '水代（合計）', type: 'currency', align: 'right', rect: { x: 0.8258, y: 0.5154, w: 0.1359, h: 0.0521 }, formula: 'mizu_d1+mizu_d2+mizu_d3+mizu_d4+mizu_d5+mizu_d6' },
  { key: 'shukuhaku_d1', label: '宿泊代（1日目）', type: 'currency', align: 'right', rect: { x: 0.1524, y: 0.5722, w: 0.1089, h: 0.0527 } },
  { key: 'shukuhaku_d2', label: '宿泊代（2日目）', type: 'currency', align: 'right', rect: { x: 0.2645, y: 0.5722, w: 0.1093, h: 0.0527 } },
  { key: 'shukuhaku_d3', label: '宿泊代（3日目）', type: 'currency', align: 'right', rect: { x: 0.377, y: 0.5722, w: 0.1093, h: 0.0527 } },
  { key: 'shukuhaku_d4', label: '宿泊代（4日目）', type: 'currency', align: 'right', rect: { x: 0.4895, y: 0.5722, w: 0.1101, h: 0.0527 } },
  { key: 'shukuhaku_d5', label: '宿泊代（5日目）', type: 'currency', align: 'right', rect: { x: 0.6028, y: 0.5722, w: 0.1089, h: 0.0527 } },
  { key: 'shukuhaku_d6', label: '宿泊代（6日目）', type: 'currency', align: 'right', rect: { x: 0.7149, y: 0.5722, w: 0.1077, h: 0.0527 } },
  { key: 'shukuhaku_total', label: '宿泊代（合計）', type: 'currency', align: 'right', rect: { x: 0.8258, y: 0.5722, w: 0.1359, h: 0.0527 }, formula: 'shukuhaku_d1+shukuhaku_d2+shukuhaku_d3+shukuhaku_d4+shukuhaku_d5+shukuhaku_d6' },
  { key: 'taxi_d1', label: 'タクシー代（1日目）', type: 'currency', align: 'right', rect: { x: 0.1524, y: 0.6296, w: 0.1089, h: 0.0521 } },
  { key: 'taxi_d2', label: 'タクシー代（2日目）', type: 'currency', align: 'right', rect: { x: 0.2645, y: 0.6296, w: 0.1093, h: 0.0521 } },
  { key: 'taxi_d3', label: 'タクシー代（3日目）', type: 'currency', align: 'right', rect: { x: 0.377, y: 0.6296, w: 0.1093, h: 0.0521 } },
  { key: 'taxi_d4', label: 'タクシー代（4日目）', type: 'currency', align: 'right', rect: { x: 0.4895, y: 0.6296, w: 0.1101, h: 0.0521 } },
  { key: 'taxi_d5', label: 'タクシー代（5日目）', type: 'currency', align: 'right', rect: { x: 0.6028, y: 0.6296, w: 0.1089, h: 0.0521 } },
  { key: 'taxi_d6', label: 'タクシー代（6日目）', type: 'currency', align: 'right', rect: { x: 0.7149, y: 0.6296, w: 0.1077, h: 0.0521 } },
  { key: 'taxi_total', label: 'タクシー代（合計）', type: 'currency', align: 'right', rect: { x: 0.8258, y: 0.6296, w: 0.1359, h: 0.0521 }, formula: 'taxi_d1+taxi_d2+taxi_d3+taxi_d4+taxi_d5+taxi_d6' },
  { key: 'sonota_d1', label: 'その他（1日目）', type: 'currency', align: 'right', rect: { x: 0.1524, y: 0.6864, w: 0.1089, h: 0.0521 } },
  { key: 'sonota_d2', label: 'その他（2日目）', type: 'currency', align: 'right', rect: { x: 0.2645, y: 0.6864, w: 0.1093, h: 0.0521 } },
  { key: 'sonota_d3', label: 'その他（3日目）', type: 'currency', align: 'right', rect: { x: 0.377, y: 0.6864, w: 0.1093, h: 0.0521 } },
  { key: 'sonota_d4', label: 'その他（4日目）', type: 'currency', align: 'right', rect: { x: 0.4895, y: 0.6864, w: 0.1101, h: 0.0521 } },
  { key: 'sonota_d5', label: 'その他（5日目）', type: 'currency', align: 'right', rect: { x: 0.6028, y: 0.6864, w: 0.1089, h: 0.0521 } },
  { key: 'sonota_d6', label: 'その他（6日目）', type: 'currency', align: 'right', rect: { x: 0.7149, y: 0.6864, w: 0.1077, h: 0.0521 } },
  { key: 'sonota_total', label: 'その他（合計）', type: 'currency', align: 'right', rect: { x: 0.8258, y: 0.6864, w: 0.1359, h: 0.0521 }, formula: 'sonota_d1+sonota_d2+sonota_d3+sonota_d4+sonota_d5+sonota_d6' },
  { key: 'total_d1', label: '合計（1日目）', type: 'currency', align: 'right', rect: { x: 0.1524, y: 0.7432, w: 0.1089, h: 0.0527 }, formula: 'kaiso_d1+etc_d1+chusha_d1+shokuji_d1+ocha_d1+mizu_d1+shukuhaku_d1+taxi_d1+sonota_d1' },
  { key: 'total_d2', label: '合計（2日目）', type: 'currency', align: 'right', rect: { x: 0.2645, y: 0.7432, w: 0.1093, h: 0.0527 }, formula: 'kaiso_d2+etc_d2+chusha_d2+shokuji_d2+ocha_d2+mizu_d2+shukuhaku_d2+taxi_d2+sonota_d2' },
  { key: 'total_d3', label: '合計（3日目）', type: 'currency', align: 'right', rect: { x: 0.377, y: 0.7432, w: 0.1093, h: 0.0527 }, formula: 'kaiso_d3+etc_d3+chusha_d3+shokuji_d3+ocha_d3+mizu_d3+shukuhaku_d3+taxi_d3+sonota_d3' },
  { key: 'total_d4', label: '合計（4日目）', type: 'currency', align: 'right', rect: { x: 0.4895, y: 0.7432, w: 0.1101, h: 0.0527 }, formula: 'kaiso_d4+etc_d4+chusha_d4+shokuji_d4+ocha_d4+mizu_d4+shukuhaku_d4+taxi_d4+sonota_d4' },
  { key: 'total_d5', label: '合計（5日目）', type: 'currency', align: 'right', rect: { x: 0.6028, y: 0.7432, w: 0.1089, h: 0.0527 }, formula: 'kaiso_d5+etc_d5+chusha_d5+shokuji_d5+ocha_d5+mizu_d5+shukuhaku_d5+taxi_d5+sonota_d5' },
  { key: 'total_d6', label: '合計（6日目）', type: 'currency', align: 'right', rect: { x: 0.7149, y: 0.7432, w: 0.1077, h: 0.0527 }, formula: 'kaiso_d6+etc_d6+chusha_d6+shokuji_d6+ocha_d6+mizu_d6+shukuhaku_d6+taxi_d6+sonota_d6' },
  { key: 'grand_total', label: '合計（総合計）', type: 'currency', align: 'right', rect: { x: 0.8258, y: 0.7432, w: 0.1359, h: 0.0527 }, formula: 'total_d1+total_d2+total_d3+total_d4+total_d5+total_d6' },
  { key: 'biko', label: '備考', type: 'text', align: 'left', rect: { x: 0.1524, y: 0.8006, w: 0.5593, h: 0.1663 } },
  { key: 'yokin', label: '預金', type: 'currency', align: 'right', rect: { x: 0.8258, y: 0.8006, w: 0.1359, h: 0.0503 } },
  { key: 'tatekae', label: '立替金', type: 'currency', align: 'right', rect: { x: 0.8258, y: 0.8556, w: 0.1359, h: 0.0521 } },
  { key: 'zankin', label: '残金', type: 'currency', align: 'right', rect: { x: 0.8258, y: 0.9124, w: 0.1359, h: 0.0527 }, formula: 'yokin+tatekae-grand_total' },
];

function parseFormula(f: string, ids: Map<string, string>): FormulaTerm[] {
  const terms: FormulaTerm[] = [];
  const re = /([+-]?)([a-z0-9_]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(f))) {
    const id = ids.get(m[2]);
    if (id) terms.push({ fieldId: id, op: m[1] === '-' ? '-' : '+' });
  }
  return terms;
}

export async function createSeisanTemplate(blobs: BlobStore, templates: TemplateRepository) {
  const srcBlob = base64ToBlob(SEISAN_PNG_BASE64);
  const img = await loadImage(srcBlob);
  const canvas = imageToCanvas(img, 2480);
  const bgBlob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
  const thumbBlob = await makeThumb(canvas);
  const bgBlobId = await blobs.put(bgBlob);
  const thumbBlobId = await blobs.put(thumbBlob);
  const sourceBlobId = await blobs.put(srcBlob);

  const ids = new Map<string, string>();
  for (const s of FIELD_SPECS) ids.set(s.key, newId());

  const fields: FieldDef[] = FIELD_SPECS.map((s) => ({
    id: ids.get(s.key)!,
    page: 0,
    rect: s.rect,
    label: s.label,
    type: s.type,
    required: false,
    ...(s.type === 'currency' ? { maxDigits: 8, comma: true } : {}),
    align: s.align,
    ...(s.formula ? { formula: parseFormula(s.formula, ids) } : {}),
  }));

  const nt: NewTemplate = {
    name: '精算表',
    kind: 'photo',
    pages: [{ index: 0, width: canvas.width, height: canvas.height, bgBlobId }],
    sourceBlobId,
    sourceMime: 'image/png',
    thumbBlobId,
    fields,
    annotations: [],
  };

  return templates.create(nt);
}
