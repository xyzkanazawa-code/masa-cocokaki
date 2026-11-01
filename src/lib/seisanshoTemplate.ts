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
 * 清算書（A4横）を「データ（罫線＋文字）」で再構成したテンプレート。
 * 写真・PDFではなく座標データなので容量が小さい。
 * 記入済みの数字は含まない（すべて入力欄）。小計・入金合計・出金合計・残高は自動計算。
 * 座標は実物の罫線を計測した値（すべて比率 0〜1）。
 */

const PW = 1754;
const PH = 1240;

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
  L(0.0222, 0.0419, 0.9766, 0.0419, 0.0015),
  L(0.0222, 0.1266, 0.9766, 0.1266, 0.0015),
  L(0.0222, 0.7871, 0.9766, 0.7871, 0.0015),
  L(0.0222, 0.0419, 0.0222, 0.7871, 0.0015),
  L(0.9766, 0.0419, 0.9766, 0.7871, 0.0015),
  L(0.1135, 0.0419, 0.1135, 0.1266, 0.0015),
  L(0.5981, 0.0419, 0.5981, 0.1266, 0.0015),
  L(0.1135, 0.0702, 0.5981, 0.0702, 0.0015),
  L(0.1135, 0.0984, 0.5981, 0.0984, 0.0015),
  L(0.0222, 0.175, 0.9766, 0.175, 0.0015),
  L(0.0222, 0.2121, 0.9766, 0.2121, 0.0015),
  L(0.0222, 0.2492, 0.9766, 0.2492, 0.0015),
  L(0.0222, 0.2863, 0.9766, 0.2863, 0.0015),
  L(0.0222, 0.3234, 0.9766, 0.3234, 0.0015),
  L(0.0222, 0.3605, 0.9766, 0.3605, 0.0015),
  L(0.0222, 0.3976, 0.9766, 0.3976, 0.0015),
  L(0.0222, 0.4347, 0.9766, 0.4347, 0.0015),
  L(0.0222, 0.4718, 0.9766, 0.4718, 0.0015),
  L(0.0222, 0.5089, 0.9766, 0.5089, 0.0015),
  L(0.0222, 0.546, 0.9766, 0.546, 0.0015),
  L(0.0222, 0.5831, 0.9766, 0.5831, 0.0015),
  L(0.0222, 0.6202, 0.9766, 0.6202, 0.0015),
  L(0.0222, 0.6573, 0.9766, 0.6573, 0.0015),
  L(0.0222, 0.6944, 0.9766, 0.6944, 0.0015),
  L(0.0222, 0.7347, 0.9766, 0.7347, 0.0015),
  L(0.0485, 0.175, 0.0485, 0.6944, 0.0015),
  L(0.1796, 0.1266, 0.1796, 0.6944, 0.0015),
  L(0.2566, 0.1266, 0.2566, 0.6944, 0.0015),
  L(0.3335, 0.1266, 0.3335, 0.6944, 0.0015),
  L(0.4105, 0.1266, 0.4105, 0.6944, 0.0015),
  L(0.4875, 0.1266, 0.4875, 0.6944, 0.0015),
  L(0.5644, 0.1266, 0.5644, 0.6944, 0.0015),
  L(0.6414, 0.1266, 0.6414, 0.6944, 0.0015),
  L(0.7184, 0.1266, 0.7184, 0.6944, 0.0015),
  L(0.8124, 0.1266, 0.8124, 0.7871, 0.0015),
  L(0.1705, 0.6944, 0.1705, 0.7347, 0.0015),
  L(0.3187, 0.6944, 0.3187, 0.7347, 0.0015)
  ],
  texts: [
  T(0.0222, 0.0065, 0.9322, 0.029, 'いつも安全運転していただき誠にありがとうございます！', 0.0145, true, 'center'),
  T(0.0222, 0.0419, 0.0912, 0.0847, '清算書', 0.03, true, 'center'),
  T(0.5981, 0.0452, 0.3786, 0.0323, '株式会社全日本交通', 0.0175, true, 'center'),
  T(0.5981, 0.0774, 0.3786, 0.0226, '東京都江東区新木場1-2-3', 0.0108, false, 'center'),
  T(0.5981, 0.0984, 0.3786, 0.0242, 'TEL：072-468-6208', 0.0108, false, 'center'),
  T(0.1209, 0.0452, 0.1881, 0.0226, 'ツアーコード（団号）：', 0.0125, false, 'left'),
  T(0.1209, 0.0734, 0.2052, 0.0226, '名前（フルネーム、全称）：', 0.0125, false, 'left'),
  T(0.1209, 0.1016, 0.1881, 0.0226, '車両情報（車輌情報）：', 0.0125, false, 'left'),
  T(0.0296, 0.1315, 0.1425, 0.021, '日付（日期）', 0.0125, false, 'left'),
  T(0.0296, 0.1532, 0.1482, 0.021, '出入金項目（収支項目）', 0.0125, false, 'left'),
  T(0.7184, 0.1315, 0.0941, 0.021, '各項目小計', 0.0125, false, 'center'),
  T(0.7184, 0.1532, 0.0941, 0.0194, '（各項目小計）', 0.011, false, 'center'),
  T(0.0234, 0.1766, 0.0239, 0.1081, '預り金', 0.0105, false, 'center'),
  T(0.0234, 0.2879, 0.0239, 0.0726, '高速料金', 0.0105, false, 'center'),
  T(0.0525, 0.1774, 0.1243, 0.0323, '仮払金／前渡し金（円）', 0.0115, false, 'left'),
  T(0.0525, 0.2145, 0.1243, 0.0323, 'ガイドからの預り金（高速）', 0.0115, false, 'left'),
  T(0.0525, 0.2516, 0.1243, 0.0323, 'ガイドからの預り金（残業）', 0.0115, false, 'left'),
  T(0.0525, 0.2887, 0.1243, 0.0323, '実車（載有乗客的车）', 0.0115, false, 'left'),
  T(0.0525, 0.3258, 0.1243, 0.0323, '回送（空車掉頭）', 0.0115, false, 'left'),
  T(0.0525, 0.3629, 0.1243, 0.0323, '現金有料道路（現金収費道路）', 0.0115, false, 'left'),
  T(0.0525, 0.4, 0.1243, 0.0323, '駐車料金（停車費）', 0.0115, false, 'left'),
  T(0.0525, 0.4355, 0.1243, 0.0177, '交通費（タクシー等）', 0.0115, false, 'left'),
  T(0.0525, 0.4532, 0.1243, 0.0161, '（交通費：出租車等）', 0.0095, false, 'left'),
  T(0.0525, 0.4742, 0.1243, 0.0323, '宿泊代（住宿費）', 0.0115, false, 'left'),
  T(0.0525, 0.5113, 0.1243, 0.0323, 'お茶代（茶費）', 0.0115, false, 'left'),
  T(0.0525, 0.5484, 0.1243, 0.0323, 'ミネラルウォーター代（矿泉水費）', 0.0115, false, 'left'),
  T(0.0525, 0.5855, 0.1243, 0.0323, '食事代（餐費）', 0.0115, false, 'left'),
  T(0.0525, 0.6226, 0.1243, 0.0323, '残業代（加班費）', 0.0115, false, 'left'),
  T(0.0525, 0.6597, 0.1243, 0.0323, 'その他（其他）', 0.0115, false, 'left'),
  T(0.8124, 0.1871, 0.1642, 0.0242, '入金合計（収繳総額）', 0.0135, true, 'center'),
  T(0.8124, 0.3065, 0.1642, 0.0242, '出金合計（支出総額）', 0.0135, true, 'center'),
  T(0.0274, 0.6984, 0.1397, 0.0323, '水積込本数（　）本', 0.0125, true, 'left'),
  T(0.1756, 0.6984, 0.1397, 0.0323, '水残本数（　）本', 0.0125, true, 'left'),
  T(0.8164, 0.6984, 0.0741, 0.0323, '残高（余額）', 0.0125, true, 'left'),
  T(0.0222, 0.7347, 0.6271, 0.0524, '上記金額に相違ありません。', 0.0135, true, 'center'),
  T(0.7355, 0.7419, 0.2281, 0.0387, 'ガイド様 署名欄', 0.0125, false, 'left')
  ],
};

type FieldSpec = {
  key: string;
  label: string;
  type: FieldDef['type'];
  align: FieldDef['align'];
  rect: { x: number; y: number; w: number; h: number };
  formula?: string;
};

const FIELD_SPECS: FieldSpec[] = [
  { key: 'tourcode', label: 'ツアーコード', type: 'text', align: 'left', rect: { x: 0.3107, y: 0.0444, w: 0.2822, h: 0.0234 } },
  { key: 'driver_name', label: '名前', type: 'text', align: 'left', rect: { x: 0.3295, y: 0.0726, w: 0.2634, h: 0.0234 } },
  { key: 'vehicle', label: '車両情報', type: 'text', align: 'left', rect: { x: 0.3107, y: 0.1008, w: 0.2822, h: 0.0234 } },
  { key: 'date1', label: '日付1', type: 'date', align: 'center', rect: { x: 0.1813, y: 0.129, w: 0.0735, h: 0.0435 } },
  { key: 'date2', label: '日付2', type: 'date', align: 'center', rect: { x: 0.2583, y: 0.129, w: 0.0735, h: 0.0435 } },
  { key: 'date3', label: '日付3', type: 'date', align: 'center', rect: { x: 0.3352, y: 0.129, w: 0.0735, h: 0.0435 } },
  { key: 'date4', label: '日付4', type: 'date', align: 'center', rect: { x: 0.4122, y: 0.129, w: 0.0735, h: 0.0435 } },
  { key: 'date5', label: '日付5', type: 'date', align: 'center', rect: { x: 0.4892, y: 0.129, w: 0.0735, h: 0.0435 } },
  { key: 'date6', label: '日付6', type: 'date', align: 'center', rect: { x: 0.5661, y: 0.129, w: 0.0735, h: 0.0435 } },
  { key: 'date7', label: '日付7', type: 'date', align: 'center', rect: { x: 0.6431, y: 0.129, w: 0.0735, h: 0.0435 } },
  { key: 'kariharai_d1', label: '仮払金（1日目）', type: 'currency', align: 'right', rect: { x: 0.1813, y: 0.1774, w: 0.0735, h: 0.0323 } },
  { key: 'kariharai_d2', label: '仮払金（2日目）', type: 'currency', align: 'right', rect: { x: 0.2583, y: 0.1774, w: 0.0735, h: 0.0323 } },
  { key: 'kariharai_d3', label: '仮払金（3日目）', type: 'currency', align: 'right', rect: { x: 0.3352, y: 0.1774, w: 0.0735, h: 0.0323 } },
  { key: 'kariharai_d4', label: '仮払金（4日目）', type: 'currency', align: 'right', rect: { x: 0.4122, y: 0.1774, w: 0.0735, h: 0.0323 } },
  { key: 'kariharai_d5', label: '仮払金（5日目）', type: 'currency', align: 'right', rect: { x: 0.4892, y: 0.1774, w: 0.0735, h: 0.0323 } },
  { key: 'kariharai_d6', label: '仮払金（6日目）', type: 'currency', align: 'right', rect: { x: 0.5661, y: 0.1774, w: 0.0735, h: 0.0323 } },
  { key: 'kariharai_d7', label: '仮払金（7日目）', type: 'currency', align: 'right', rect: { x: 0.6431, y: 0.1774, w: 0.0735, h: 0.0323 } },
  { key: 'kariharai_sub', label: '仮払金（小計）', type: 'currency', align: 'right', rect: { x: 0.7201, y: 0.1774, w: 0.0906, h: 0.0323 }, formula: 'kariharai_d1+kariharai_d2+kariharai_d3+kariharai_d4+kariharai_d5+kariharai_d6+kariharai_d7' },
  { key: 'guide_highway_d1', label: 'ガイド預り金（高速）（1日目）', type: 'currency', align: 'right', rect: { x: 0.1813, y: 0.2145, w: 0.0735, h: 0.0323 } },
  { key: 'guide_highway_d2', label: 'ガイド預り金（高速）（2日目）', type: 'currency', align: 'right', rect: { x: 0.2583, y: 0.2145, w: 0.0735, h: 0.0323 } },
  { key: 'guide_highway_d3', label: 'ガイド預り金（高速）（3日目）', type: 'currency', align: 'right', rect: { x: 0.3352, y: 0.2145, w: 0.0735, h: 0.0323 } },
  { key: 'guide_highway_d4', label: 'ガイド預り金（高速）（4日目）', type: 'currency', align: 'right', rect: { x: 0.4122, y: 0.2145, w: 0.0735, h: 0.0323 } },
  { key: 'guide_highway_d5', label: 'ガイド預り金（高速）（5日目）', type: 'currency', align: 'right', rect: { x: 0.4892, y: 0.2145, w: 0.0735, h: 0.0323 } },
  { key: 'guide_highway_d6', label: 'ガイド預り金（高速）（6日目）', type: 'currency', align: 'right', rect: { x: 0.5661, y: 0.2145, w: 0.0735, h: 0.0323 } },
  { key: 'guide_highway_d7', label: 'ガイド預り金（高速）（7日目）', type: 'currency', align: 'right', rect: { x: 0.6431, y: 0.2145, w: 0.0735, h: 0.0323 } },
  { key: 'guide_highway_sub', label: 'ガイド預り金（高速）（小計）', type: 'currency', align: 'right', rect: { x: 0.7201, y: 0.2145, w: 0.0906, h: 0.0323 }, formula: 'guide_highway_d1+guide_highway_d2+guide_highway_d3+guide_highway_d4+guide_highway_d5+guide_highway_d6+guide_highway_d7' },
  { key: 'guide_overtime_d1', label: 'ガイド預り金（残業）（1日目）', type: 'currency', align: 'right', rect: { x: 0.1813, y: 0.2516, w: 0.0735, h: 0.0323 } },
  { key: 'guide_overtime_d2', label: 'ガイド預り金（残業）（2日目）', type: 'currency', align: 'right', rect: { x: 0.2583, y: 0.2516, w: 0.0735, h: 0.0323 } },
  { key: 'guide_overtime_d3', label: 'ガイド預り金（残業）（3日目）', type: 'currency', align: 'right', rect: { x: 0.3352, y: 0.2516, w: 0.0735, h: 0.0323 } },
  { key: 'guide_overtime_d4', label: 'ガイド預り金（残業）（4日目）', type: 'currency', align: 'right', rect: { x: 0.4122, y: 0.2516, w: 0.0735, h: 0.0323 } },
  { key: 'guide_overtime_d5', label: 'ガイド預り金（残業）（5日目）', type: 'currency', align: 'right', rect: { x: 0.4892, y: 0.2516, w: 0.0735, h: 0.0323 } },
  { key: 'guide_overtime_d6', label: 'ガイド預り金（残業）（6日目）', type: 'currency', align: 'right', rect: { x: 0.5661, y: 0.2516, w: 0.0735, h: 0.0323 } },
  { key: 'guide_overtime_d7', label: 'ガイド預り金（残業）（7日目）', type: 'currency', align: 'right', rect: { x: 0.6431, y: 0.2516, w: 0.0735, h: 0.0323 } },
  { key: 'guide_overtime_sub', label: 'ガイド預り金（残業）（小計）', type: 'currency', align: 'right', rect: { x: 0.7201, y: 0.2516, w: 0.0906, h: 0.0323 }, formula: 'guide_overtime_d1+guide_overtime_d2+guide_overtime_d3+guide_overtime_d4+guide_overtime_d5+guide_overtime_d6+guide_overtime_d7' },
  { key: 'jissha_d1', label: '実車（1日目）', type: 'currency', align: 'right', rect: { x: 0.1813, y: 0.2887, w: 0.0735, h: 0.0323 } },
  { key: 'jissha_d2', label: '実車（2日目）', type: 'currency', align: 'right', rect: { x: 0.2583, y: 0.2887, w: 0.0735, h: 0.0323 } },
  { key: 'jissha_d3', label: '実車（3日目）', type: 'currency', align: 'right', rect: { x: 0.3352, y: 0.2887, w: 0.0735, h: 0.0323 } },
  { key: 'jissha_d4', label: '実車（4日目）', type: 'currency', align: 'right', rect: { x: 0.4122, y: 0.2887, w: 0.0735, h: 0.0323 } },
  { key: 'jissha_d5', label: '実車（5日目）', type: 'currency', align: 'right', rect: { x: 0.4892, y: 0.2887, w: 0.0735, h: 0.0323 } },
  { key: 'jissha_d6', label: '実車（6日目）', type: 'currency', align: 'right', rect: { x: 0.5661, y: 0.2887, w: 0.0735, h: 0.0323 } },
  { key: 'jissha_d7', label: '実車（7日目）', type: 'currency', align: 'right', rect: { x: 0.6431, y: 0.2887, w: 0.0735, h: 0.0323 } },
  { key: 'jissha_sub', label: '実車（小計）', type: 'currency', align: 'right', rect: { x: 0.7201, y: 0.2887, w: 0.0906, h: 0.0323 }, formula: 'jissha_d1+jissha_d2+jissha_d3+jissha_d4+jissha_d5+jissha_d6+jissha_d7' },
  { key: 'kaiso_d1', label: '回送（1日目）', type: 'currency', align: 'right', rect: { x: 0.1813, y: 0.3258, w: 0.0735, h: 0.0323 } },
  { key: 'kaiso_d2', label: '回送（2日目）', type: 'currency', align: 'right', rect: { x: 0.2583, y: 0.3258, w: 0.0735, h: 0.0323 } },
  { key: 'kaiso_d3', label: '回送（3日目）', type: 'currency', align: 'right', rect: { x: 0.3352, y: 0.3258, w: 0.0735, h: 0.0323 } },
  { key: 'kaiso_d4', label: '回送（4日目）', type: 'currency', align: 'right', rect: { x: 0.4122, y: 0.3258, w: 0.0735, h: 0.0323 } },
  { key: 'kaiso_d5', label: '回送（5日目）', type: 'currency', align: 'right', rect: { x: 0.4892, y: 0.3258, w: 0.0735, h: 0.0323 } },
  { key: 'kaiso_d6', label: '回送（6日目）', type: 'currency', align: 'right', rect: { x: 0.5661, y: 0.3258, w: 0.0735, h: 0.0323 } },
  { key: 'kaiso_d7', label: '回送（7日目）', type: 'currency', align: 'right', rect: { x: 0.6431, y: 0.3258, w: 0.0735, h: 0.0323 } },
  { key: 'kaiso_sub', label: '回送（小計）', type: 'currency', align: 'right', rect: { x: 0.7201, y: 0.3258, w: 0.0906, h: 0.0323 }, formula: 'kaiso_d1+kaiso_d2+kaiso_d3+kaiso_d4+kaiso_d5+kaiso_d6+kaiso_d7' },
  { key: 'genkin_d1', label: '現金有料道路（1日目）', type: 'currency', align: 'right', rect: { x: 0.1813, y: 0.3629, w: 0.0735, h: 0.0323 } },
  { key: 'genkin_d2', label: '現金有料道路（2日目）', type: 'currency', align: 'right', rect: { x: 0.2583, y: 0.3629, w: 0.0735, h: 0.0323 } },
  { key: 'genkin_d3', label: '現金有料道路（3日目）', type: 'currency', align: 'right', rect: { x: 0.3352, y: 0.3629, w: 0.0735, h: 0.0323 } },
  { key: 'genkin_d4', label: '現金有料道路（4日目）', type: 'currency', align: 'right', rect: { x: 0.4122, y: 0.3629, w: 0.0735, h: 0.0323 } },
  { key: 'genkin_d5', label: '現金有料道路（5日目）', type: 'currency', align: 'right', rect: { x: 0.4892, y: 0.3629, w: 0.0735, h: 0.0323 } },
  { key: 'genkin_d6', label: '現金有料道路（6日目）', type: 'currency', align: 'right', rect: { x: 0.5661, y: 0.3629, w: 0.0735, h: 0.0323 } },
  { key: 'genkin_d7', label: '現金有料道路（7日目）', type: 'currency', align: 'right', rect: { x: 0.6431, y: 0.3629, w: 0.0735, h: 0.0323 } },
  { key: 'genkin_sub', label: '現金有料道路（小計）', type: 'currency', align: 'right', rect: { x: 0.7201, y: 0.3629, w: 0.0906, h: 0.0323 }, formula: 'genkin_d1+genkin_d2+genkin_d3+genkin_d4+genkin_d5+genkin_d6+genkin_d7' },
  { key: 'chusha_d1', label: '駐車料金（1日目）', type: 'currency', align: 'right', rect: { x: 0.1813, y: 0.4, w: 0.0735, h: 0.0323 } },
  { key: 'chusha_d2', label: '駐車料金（2日目）', type: 'currency', align: 'right', rect: { x: 0.2583, y: 0.4, w: 0.0735, h: 0.0323 } },
  { key: 'chusha_d3', label: '駐車料金（3日目）', type: 'currency', align: 'right', rect: { x: 0.3352, y: 0.4, w: 0.0735, h: 0.0323 } },
  { key: 'chusha_d4', label: '駐車料金（4日目）', type: 'currency', align: 'right', rect: { x: 0.4122, y: 0.4, w: 0.0735, h: 0.0323 } },
  { key: 'chusha_d5', label: '駐車料金（5日目）', type: 'currency', align: 'right', rect: { x: 0.4892, y: 0.4, w: 0.0735, h: 0.0323 } },
  { key: 'chusha_d6', label: '駐車料金（6日目）', type: 'currency', align: 'right', rect: { x: 0.5661, y: 0.4, w: 0.0735, h: 0.0323 } },
  { key: 'chusha_d7', label: '駐車料金（7日目）', type: 'currency', align: 'right', rect: { x: 0.6431, y: 0.4, w: 0.0735, h: 0.0323 } },
  { key: 'chusha_sub', label: '駐車料金（小計）', type: 'currency', align: 'right', rect: { x: 0.7201, y: 0.4, w: 0.0906, h: 0.0323 }, formula: 'chusha_d1+chusha_d2+chusha_d3+chusha_d4+chusha_d5+chusha_d6+chusha_d7' },
  { key: 'kotsu_d1', label: '交通費（1日目）', type: 'currency', align: 'right', rect: { x: 0.1813, y: 0.4371, w: 0.0735, h: 0.0323 } },
  { key: 'kotsu_d2', label: '交通費（2日目）', type: 'currency', align: 'right', rect: { x: 0.2583, y: 0.4371, w: 0.0735, h: 0.0323 } },
  { key: 'kotsu_d3', label: '交通費（3日目）', type: 'currency', align: 'right', rect: { x: 0.3352, y: 0.4371, w: 0.0735, h: 0.0323 } },
  { key: 'kotsu_d4', label: '交通費（4日目）', type: 'currency', align: 'right', rect: { x: 0.4122, y: 0.4371, w: 0.0735, h: 0.0323 } },
  { key: 'kotsu_d5', label: '交通費（5日目）', type: 'currency', align: 'right', rect: { x: 0.4892, y: 0.4371, w: 0.0735, h: 0.0323 } },
  { key: 'kotsu_d6', label: '交通費（6日目）', type: 'currency', align: 'right', rect: { x: 0.5661, y: 0.4371, w: 0.0735, h: 0.0323 } },
  { key: 'kotsu_d7', label: '交通費（7日目）', type: 'currency', align: 'right', rect: { x: 0.6431, y: 0.4371, w: 0.0735, h: 0.0323 } },
  { key: 'kotsu_sub', label: '交通費（小計）', type: 'currency', align: 'right', rect: { x: 0.7201, y: 0.4371, w: 0.0906, h: 0.0323 }, formula: 'kotsu_d1+kotsu_d2+kotsu_d3+kotsu_d4+kotsu_d5+kotsu_d6+kotsu_d7' },
  { key: 'shukuhaku_d1', label: '宿泊代（1日目）', type: 'currency', align: 'right', rect: { x: 0.1813, y: 0.4742, w: 0.0735, h: 0.0323 } },
  { key: 'shukuhaku_d2', label: '宿泊代（2日目）', type: 'currency', align: 'right', rect: { x: 0.2583, y: 0.4742, w: 0.0735, h: 0.0323 } },
  { key: 'shukuhaku_d3', label: '宿泊代（3日目）', type: 'currency', align: 'right', rect: { x: 0.3352, y: 0.4742, w: 0.0735, h: 0.0323 } },
  { key: 'shukuhaku_d4', label: '宿泊代（4日目）', type: 'currency', align: 'right', rect: { x: 0.4122, y: 0.4742, w: 0.0735, h: 0.0323 } },
  { key: 'shukuhaku_d5', label: '宿泊代（5日目）', type: 'currency', align: 'right', rect: { x: 0.4892, y: 0.4742, w: 0.0735, h: 0.0323 } },
  { key: 'shukuhaku_d6', label: '宿泊代（6日目）', type: 'currency', align: 'right', rect: { x: 0.5661, y: 0.4742, w: 0.0735, h: 0.0323 } },
  { key: 'shukuhaku_d7', label: '宿泊代（7日目）', type: 'currency', align: 'right', rect: { x: 0.6431, y: 0.4742, w: 0.0735, h: 0.0323 } },
  { key: 'shukuhaku_sub', label: '宿泊代（小計）', type: 'currency', align: 'right', rect: { x: 0.7201, y: 0.4742, w: 0.0906, h: 0.0323 }, formula: 'shukuhaku_d1+shukuhaku_d2+shukuhaku_d3+shukuhaku_d4+shukuhaku_d5+shukuhaku_d6+shukuhaku_d7' },
  { key: 'ocha_d1', label: 'お茶代（1日目）', type: 'currency', align: 'right', rect: { x: 0.1813, y: 0.5113, w: 0.0735, h: 0.0323 } },
  { key: 'ocha_d2', label: 'お茶代（2日目）', type: 'currency', align: 'right', rect: { x: 0.2583, y: 0.5113, w: 0.0735, h: 0.0323 } },
  { key: 'ocha_d3', label: 'お茶代（3日目）', type: 'currency', align: 'right', rect: { x: 0.3352, y: 0.5113, w: 0.0735, h: 0.0323 } },
  { key: 'ocha_d4', label: 'お茶代（4日目）', type: 'currency', align: 'right', rect: { x: 0.4122, y: 0.5113, w: 0.0735, h: 0.0323 } },
  { key: 'ocha_d5', label: 'お茶代（5日目）', type: 'currency', align: 'right', rect: { x: 0.4892, y: 0.5113, w: 0.0735, h: 0.0323 } },
  { key: 'ocha_d6', label: 'お茶代（6日目）', type: 'currency', align: 'right', rect: { x: 0.5661, y: 0.5113, w: 0.0735, h: 0.0323 } },
  { key: 'ocha_d7', label: 'お茶代（7日目）', type: 'currency', align: 'right', rect: { x: 0.6431, y: 0.5113, w: 0.0735, h: 0.0323 } },
  { key: 'ocha_sub', label: 'お茶代（小計）', type: 'currency', align: 'right', rect: { x: 0.7201, y: 0.5113, w: 0.0906, h: 0.0323 }, formula: 'ocha_d1+ocha_d2+ocha_d3+ocha_d4+ocha_d5+ocha_d6+ocha_d7' },
  { key: 'mizu_d1', label: 'ミネラルウォーター代（1日目）', type: 'currency', align: 'right', rect: { x: 0.1813, y: 0.5484, w: 0.0735, h: 0.0323 } },
  { key: 'mizu_d2', label: 'ミネラルウォーター代（2日目）', type: 'currency', align: 'right', rect: { x: 0.2583, y: 0.5484, w: 0.0735, h: 0.0323 } },
  { key: 'mizu_d3', label: 'ミネラルウォーター代（3日目）', type: 'currency', align: 'right', rect: { x: 0.3352, y: 0.5484, w: 0.0735, h: 0.0323 } },
  { key: 'mizu_d4', label: 'ミネラルウォーター代（4日目）', type: 'currency', align: 'right', rect: { x: 0.4122, y: 0.5484, w: 0.0735, h: 0.0323 } },
  { key: 'mizu_d5', label: 'ミネラルウォーター代（5日目）', type: 'currency', align: 'right', rect: { x: 0.4892, y: 0.5484, w: 0.0735, h: 0.0323 } },
  { key: 'mizu_d6', label: 'ミネラルウォーター代（6日目）', type: 'currency', align: 'right', rect: { x: 0.5661, y: 0.5484, w: 0.0735, h: 0.0323 } },
  { key: 'mizu_d7', label: 'ミネラルウォーター代（7日目）', type: 'currency', align: 'right', rect: { x: 0.6431, y: 0.5484, w: 0.0735, h: 0.0323 } },
  { key: 'mizu_sub', label: 'ミネラルウォーター代（小計）', type: 'currency', align: 'right', rect: { x: 0.7201, y: 0.5484, w: 0.0906, h: 0.0323 }, formula: 'mizu_d1+mizu_d2+mizu_d3+mizu_d4+mizu_d5+mizu_d6+mizu_d7' },
  { key: 'shokuji_d1', label: '食事代（1日目）', type: 'currency', align: 'right', rect: { x: 0.1813, y: 0.5855, w: 0.0735, h: 0.0323 } },
  { key: 'shokuji_d2', label: '食事代（2日目）', type: 'currency', align: 'right', rect: { x: 0.2583, y: 0.5855, w: 0.0735, h: 0.0323 } },
  { key: 'shokuji_d3', label: '食事代（3日目）', type: 'currency', align: 'right', rect: { x: 0.3352, y: 0.5855, w: 0.0735, h: 0.0323 } },
  { key: 'shokuji_d4', label: '食事代（4日目）', type: 'currency', align: 'right', rect: { x: 0.4122, y: 0.5855, w: 0.0735, h: 0.0323 } },
  { key: 'shokuji_d5', label: '食事代（5日目）', type: 'currency', align: 'right', rect: { x: 0.4892, y: 0.5855, w: 0.0735, h: 0.0323 } },
  { key: 'shokuji_d6', label: '食事代（6日目）', type: 'currency', align: 'right', rect: { x: 0.5661, y: 0.5855, w: 0.0735, h: 0.0323 } },
  { key: 'shokuji_d7', label: '食事代（7日目）', type: 'currency', align: 'right', rect: { x: 0.6431, y: 0.5855, w: 0.0735, h: 0.0323 } },
  { key: 'shokuji_sub', label: '食事代（小計）', type: 'currency', align: 'right', rect: { x: 0.7201, y: 0.5855, w: 0.0906, h: 0.0323 }, formula: 'shokuji_d1+shokuji_d2+shokuji_d3+shokuji_d4+shokuji_d5+shokuji_d6+shokuji_d7' },
  { key: 'zangyo_d1', label: '残業代（1日目）', type: 'currency', align: 'right', rect: { x: 0.1813, y: 0.6226, w: 0.0735, h: 0.0323 } },
  { key: 'zangyo_d2', label: '残業代（2日目）', type: 'currency', align: 'right', rect: { x: 0.2583, y: 0.6226, w: 0.0735, h: 0.0323 } },
  { key: 'zangyo_d3', label: '残業代（3日目）', type: 'currency', align: 'right', rect: { x: 0.3352, y: 0.6226, w: 0.0735, h: 0.0323 } },
  { key: 'zangyo_d4', label: '残業代（4日目）', type: 'currency', align: 'right', rect: { x: 0.4122, y: 0.6226, w: 0.0735, h: 0.0323 } },
  { key: 'zangyo_d5', label: '残業代（5日目）', type: 'currency', align: 'right', rect: { x: 0.4892, y: 0.6226, w: 0.0735, h: 0.0323 } },
  { key: 'zangyo_d6', label: '残業代（6日目）', type: 'currency', align: 'right', rect: { x: 0.5661, y: 0.6226, w: 0.0735, h: 0.0323 } },
  { key: 'zangyo_d7', label: '残業代（7日目）', type: 'currency', align: 'right', rect: { x: 0.6431, y: 0.6226, w: 0.0735, h: 0.0323 } },
  { key: 'zangyo_sub', label: '残業代（小計）', type: 'currency', align: 'right', rect: { x: 0.7201, y: 0.6226, w: 0.0906, h: 0.0323 }, formula: 'zangyo_d1+zangyo_d2+zangyo_d3+zangyo_d4+zangyo_d5+zangyo_d6+zangyo_d7' },
  { key: 'sonota_d1', label: 'その他（1日目）', type: 'currency', align: 'right', rect: { x: 0.1813, y: 0.6597, w: 0.0735, h: 0.0323 } },
  { key: 'sonota_d2', label: 'その他（2日目）', type: 'currency', align: 'right', rect: { x: 0.2583, y: 0.6597, w: 0.0735, h: 0.0323 } },
  { key: 'sonota_d3', label: 'その他（3日目）', type: 'currency', align: 'right', rect: { x: 0.3352, y: 0.6597, w: 0.0735, h: 0.0323 } },
  { key: 'sonota_d4', label: 'その他（4日目）', type: 'currency', align: 'right', rect: { x: 0.4122, y: 0.6597, w: 0.0735, h: 0.0323 } },
  { key: 'sonota_d5', label: 'その他（5日目）', type: 'currency', align: 'right', rect: { x: 0.4892, y: 0.6597, w: 0.0735, h: 0.0323 } },
  { key: 'sonota_d6', label: 'その他（6日目）', type: 'currency', align: 'right', rect: { x: 0.5661, y: 0.6597, w: 0.0735, h: 0.0323 } },
  { key: 'sonota_d7', label: 'その他（7日目）', type: 'currency', align: 'right', rect: { x: 0.6431, y: 0.6597, w: 0.0735, h: 0.0323 } },
  { key: 'sonota_sub', label: 'その他（小計）', type: 'currency', align: 'right', rect: { x: 0.7201, y: 0.6597, w: 0.0906, h: 0.0323 }, formula: 'sonota_d1+sonota_d2+sonota_d3+sonota_d4+sonota_d5+sonota_d6+sonota_d7' },
  { key: 'total_in', label: '入金合計', type: 'currency', align: 'right', rect: { x: 0.8153, y: 0.2218, w: 0.1585, h: 0.0444 }, formula: 'kariharai_sub+guide_highway_sub+guide_overtime_sub' },
  { key: 'total_out', label: '出金合計', type: 'currency', align: 'right', rect: { x: 0.8153, y: 0.4395, w: 0.1585, h: 0.0444 }, formula: 'jissha_sub+kaiso_sub+genkin_sub+chusha_sub+kotsu_sub+shukuhaku_sub+ocha_sub+mizu_sub+shokuji_sub+zangyo_sub+sonota_sub' },
  { key: 'mizu_in', label: '水積込本数', type: 'number', align: 'center', rect: { x: 0.0827, y: 0.6984, w: 0.0239, h: 0.0323 } },
  { key: 'mizu_left', label: '水残本数', type: 'number', align: 'center', rect: { x: 0.2212, y: 0.6984, w: 0.0239, h: 0.0323 } },
  { key: 'balance', label: '残高', type: 'currency', align: 'right', rect: { x: 0.8894, y: 0.6968, w: 0.0844, h: 0.0355 }, formula: 'total_in-total_out' },
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

export async function createSeisanshoTemplate(blobs: BlobStore, templates: TemplateRepository) {
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
    name: '清算書',
    kind: 'rebuilt',
    pages: [
      {
        index: 0,
        width: PW,
        height: PH,
        bgBlobId,
        paperSizeName: 'A4',
        widthMm: 297,
        heightMm: 210,
      },
    ],
    sourceBlobId: bgBlobId,
    sourceMime: 'image/jpeg',
    thumbBlobId,
    fields,
    annotations: [],
    rebuild: [REBUILD_PAGE],
  };

  return templates.create(nt);
}
