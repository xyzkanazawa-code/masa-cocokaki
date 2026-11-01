import type { BlobStore, TemplateRepository } from '../repo/types';
import type {
  FieldDef,
  FormulaTerm,
  NewTemplate,
  RebuildLine,
  RebuildPage,
  RebuildText,
} from '../types';
import { ensureCanvasFonts } from './fonts';
import { canvasToBlob, makeThumb, newCanvas } from './image';
import { newId } from './id';
import { drawRebuild } from './render';

/**
 * 実物の精算表を「データ（罫線＋文字）」で再構成したテンプレート。
 * 写真画像ではなく座標データなので容量が小さく、拡大しても線がきれい。
 * 座標は実物スキャンの罫線を計測した値（すべて比率 0〜1）。
 * 入力欄83件は初期配置済み。合計欄と残金は formula（自動計算）。
 */

const PW = 2480;
const PH = 1690;

function L(x1: number, y1: number, x2: number, y2: number, width: number): RebuildLine {
  return { id: newId(), x1, y1, x2, y2, width };
}

function T(
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
  fontSize: number,
  bold: boolean,
  align: RebuildText['align'],
): RebuildText {
  return { id: newId(), rect: { x, y, w, h }, text, fontSize, bold, align };
}

const REBUILD_PAGE: RebuildPage = {
  page: 0,
  lines: [
  L(0.0359, 0.1704, 0.0359, 0.9692, 0.0013),
  L(0.1508, 0.1704, 0.1508, 0.9692, 0.0013),
  L(0.2629, 0.1704, 0.2629, 0.7982, 0.0013),
  L(0.3754, 0.1704, 0.3754, 0.7982, 0.0013),
  L(0.4879, 0.1704, 0.4879, 0.7982, 0.0013),
  L(0.6012, 0.1704, 0.6012, 0.7982, 0.0013),
  L(0.7133, 0.1704, 0.7133, 0.9692, 0.0013),
  L(0.8242, 0.1704, 0.8242, 0.9692, 0.0013),
  L(0.9633, 0.1704, 0.9633, 0.9692, 0.0013),
  L(0.0359, 0.1704, 0.9633, 0.1704, 0.0013),
  L(0.0359, 0.2278, 0.9633, 0.2278, 0.0013),
  L(0.0359, 0.2852, 0.9633, 0.2852, 0.0013),
  L(0.0359, 0.342, 0.9633, 0.342, 0.0013),
  L(0.0359, 0.3988, 0.9633, 0.3988, 0.0013),
  L(0.0359, 0.4556, 0.9633, 0.4556, 0.0013),
  L(0.0359, 0.513, 0.9633, 0.513, 0.0013),
  L(0.0359, 0.5698, 0.9633, 0.5698, 0.0013),
  L(0.0359, 0.6272, 0.9633, 0.6272, 0.0013),
  L(0.0359, 0.684, 0.9633, 0.684, 0.0013),
  L(0.0359, 0.7408, 0.9633, 0.7408, 0.0013),
  L(0.0359, 0.7982, 0.9633, 0.7982, 0.0013),
  L(0.0359, 0.9692, 0.9633, 0.9692, 0.0013),
  L(0.7133, 0.8533, 0.9633, 0.8533, 0.0013),
  L(0.7133, 0.9101, 0.9633, 0.9101, 0.0013),
  L(0.0621, 0.1515, 0.4448, 0.1515, 0.0008),
  L(0.4923, 0.1515, 0.754, 0.1515, 0.0008),
  L(0.7794, 0.1515, 0.9532, 0.1515, 0.0008),
  L(0.4032, 0.0888, 0.5423, 0.0888, 0.0012),
  L(0.4032, 0.0941, 0.5423, 0.0941, 0.0007)
  ],
  texts: [
  T(0.379, 0.0343, 0.2419, 0.0544, '精算表', 0.031, true, 'center'),
  T(0.0452, 0.1053, 0.0968, 0.0438, '団体名：', 0.02, false, 'left'),
  T(0.4911, 0.1053, 0.0968, 0.0438, '運転手：', 0.02, false, 'left'),
  T(0.7774, 0.1053, 0.0766, 0.0438, '車番：', 0.02, false, 'left'),
  T(0.0375, 0.1728, 0.1117, 0.0527, '項 目', 0.019, false, 'center'),
  T(0.0988, 0.1716, 0.0504, 0.0237, '日付', 0.012, false, 'right'),
  T(0.1524, 0.1728, 0.1089, 0.0527, '月 日', 0.016, false, 'right'),
  T(0.2645, 0.1728, 0.1093, 0.0527, '月 日', 0.016, false, 'right'),
  T(0.377, 0.1728, 0.1093, 0.0527, '月 日', 0.016, false, 'right'),
  T(0.4895, 0.1728, 0.1101, 0.0527, '月 日', 0.016, false, 'right'),
  T(0.6028, 0.1728, 0.1089, 0.0527, '月 日', 0.016, false, 'right'),
  T(0.7149, 0.1728, 0.1077, 0.0527, '月 日', 0.016, false, 'right'),
  T(0.8258, 0.1728, 0.1359, 0.0527, '合 計', 0.019, true, 'center'),
  T(0.0375, 0.2302, 0.1117, 0.0527, '回送代', 0.019, false, 'center'),
  T(0.0375, 0.2876, 0.1117, 0.0521, '実車ETC代', 0.019, false, 'center'),
  T(0.0375, 0.3444, 0.1117, 0.0521, '駐車代', 0.019, false, 'center'),
  T(0.0375, 0.4012, 0.1117, 0.0521, '食事代', 0.019, false, 'center'),
  T(0.0375, 0.458, 0.1117, 0.0527, 'お茶代', 0.019, false, 'center'),
  T(0.0375, 0.5154, 0.1117, 0.0521, '水代', 0.019, false, 'center'),
  T(0.0375, 0.5722, 0.1117, 0.0527, '宿泊代', 0.019, false, 'center'),
  T(0.0375, 0.6296, 0.1117, 0.0521, 'タクシー代', 0.019, false, 'center'),
  T(0.0375, 0.7432, 0.1117, 0.0527, '合計', 0.019, true, 'center'),
  T(0.0375, 0.8006, 0.1117, 0.1663, '備 考', 0.019, false, 'center'),
  T(0.7149, 0.8006, 0.1077, 0.0503, '預金', 0.019, false, 'center'),
  T(0.7149, 0.8556, 0.1077, 0.0521, '立替金', 0.019, false, 'center'),
  T(0.7149, 0.9124, 0.1077, 0.0527, '残金', 0.019, false, 'center')
  ],
};

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
  // 背景用の画像は、データから描いたものを保存する（表示は rebuild データが優先される）
  await ensureCanvasFonts();
  const canvas = newCanvas(PW, PH);
  const ctx = canvas.getContext('2d')!;
  drawRebuild(ctx, REBUILD_PAGE, PW, PH);
  const bgBlob = await canvasToBlob(canvas, 'image/jpeg', 0.9);
  const thumbBlob = await makeThumb(canvas);
  const bgBlobId = await blobs.put(bgBlob);
  const thumbBlobId = await blobs.put(thumbBlob);

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
    kind: 'rebuilt',
    pages: [{ index: 0, width: PW, height: PH, bgBlobId }],
    sourceBlobId: bgBlobId,
    sourceMime: 'image/jpeg',
    thumbBlobId,
    fields,
    annotations: [],
    rebuild: [REBUILD_PAGE],
  };

  return templates.create(nt);
}
