/** 用紙サイズ（mm）定義とポイント変換 (1mm ≒ 2.83465pt) */

export interface PaperSizeOption {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
}

export const STANDARD_PAPER_SIZES: PaperSizeOption[] = [
  { id: 'A4', label: 'A4（210 × 297 mm）', widthMm: 210, heightMm: 297 },
  { id: 'A3', label: 'A3（297 × 420 mm）', widthMm: 297, heightMm: 420 },
  { id: 'B4', label: 'B4（257 × 364 mm）', widthMm: 257, heightMm: 364 },
  { id: 'B5', label: 'B5（182 × 257 mm）', widthMm: 182, heightMm: 257 },
  { id: 'A5', label: 'A5（148 × 210 mm）', widthMm: 148, heightMm: 210 },
  { id: 'custom', label: 'カスタム（mmで直接指定）', widthMm: 210, heightMm: 297 },
];

export const MM_TO_PT = 72 / 25.4; // 約2.83464567

export function mmToPt(mm: number): number {
  return mm * MM_TO_PT;
}

export function ptToMm(pt: number): number {
  return pt / MM_TO_PT;
}

export function formatPaperSize(sizeName?: string, widthMm?: number, heightMm?: number): string {
  if (sizeName && sizeName !== 'custom') {
    const std = STANDARD_PAPER_SIZES.find((s) => s.id === sizeName);
    if (std) return std.label;
    return sizeName;
  }
  if (widthMm && heightMm) {
    return `${Math.round(widthMm)} × ${Math.round(heightMm)} mm`;
  }
  return '';
}
