/** 日本および国際規格で一般的に流通・使用されている既製品用紙サイズ（mm）全一覧 */

export interface PaperSizeOption {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
  category: 'A判' | 'B判（JIS）' | 'ビジネス・帳票・伝票' | '封筒' | '写真・カード' | 'その他';
}

export const STANDARD_PAPER_SIZES: PaperSizeOption[] = [
  // --- A列（ISO 216 / JIS A列） ---
  { id: 'A0', label: 'A0（841 × 1189 mm）', widthMm: 841, heightMm: 1189, category: 'A判' },
  { id: 'A1', label: 'A1（594 × 841 mm）', widthMm: 594, heightMm: 841, category: 'A判' },
  { id: 'A2', label: 'A2（420 × 594 mm）', widthMm: 420, heightMm: 594, category: 'A判' },
  { id: 'A3', label: 'A3（297 × 420 mm）', widthMm: 297, heightMm: 420, category: 'A判' },
  { id: 'A4', label: 'A4（210 × 297 mm）★標準', widthMm: 210, heightMm: 297, category: 'A判' },
  { id: 'A5', label: 'A5（148 × 210 mm）', widthMm: 148, heightMm: 210, category: 'A判' },
  { id: 'A6', label: 'A6・文庫本（105 × 148 mm）', widthMm: 105, heightMm: 148, category: 'A判' },
  { id: 'A7', label: 'A7（74 × 105 mm）', widthMm: 74, heightMm: 105, category: 'A判' },

  // --- B列（JIS B列：日本の帳票・書類規格） ---
  { id: 'B0', label: 'B0（1030 × 1456 mm）', widthMm: 1030, heightMm: 1456, category: 'B判（JIS）' },
  { id: 'B1', label: 'B1（728 × 1030 mm）', widthMm: 728, heightMm: 1030, category: 'B判（JIS）' },
  { id: 'B2', label: 'B2（515 × 728 mm）', widthMm: 515, heightMm: 728, category: 'B判（JIS）' },
  { id: 'B3', label: 'B3（364 × 515 mm）', widthMm: 364, heightMm: 515, category: 'B判（JIS）' },
  { id: 'B4', label: 'B4（257 × 364 mm）', widthMm: 257, heightMm: 364, category: 'B判（JIS）' },
  { id: 'B5', label: 'B5（182 × 257 mm）★週刊誌・帳票', widthMm: 182, heightMm: 257, category: 'B判（JIS）' },
  { id: 'B6', label: 'B6（128 × 182 mm）★単行本', widthMm: 128, heightMm: 182, category: 'B判（JIS）' },
  { id: 'B7', label: 'B7（91 × 128 mm）★パスポート等', widthMm: 91, heightMm: 128, category: 'B判（JIS）' },

  // --- ビジネス帳票・伝票・オフィス規格 ---
  { id: 'letter', label: 'レター / Letter（215.9 × 279.4 mm）', widthMm: 215.9, heightMm: 279.4, category: 'ビジネス・帳票・伝票' },
  { id: 'legal', label: 'リーガル / Legal（215.9 × 355.6 mm）', widthMm: 215.9, heightMm: 355.6, category: 'ビジネス・帳票・伝票' },
  { id: 'invoice_receipt', label: '領収書・入出金伝票（88 × 125 mm / B7横）', widthMm: 88, heightMm: 125, category: 'ビジネス・帳票・伝票' },
  { id: 'furikomi', label: '振替伝票（106 × 188 mm）', widthMm: 106, heightMm: 188, category: 'ビジネス・帳票・伝票' },
  { id: 'shiire_receipt', label: '仕入・納品伝票（106 × 150 mm / A6変形）', widthMm: 106, heightMm: 150, category: 'ビジネス・帳票・伝票' },
  { id: 'checks', label: '手形・小切手判（85 × 170 mm）', widthMm: 85, heightMm: 170, category: 'ビジネス・帳票・伝票' },

  // --- 封筒サイズ（既製品封筒書類） ---
  { id: 'n4', label: '長形4号（90 × 205 mm）★B5四つ折り', widthMm: 90, heightMm: 205, category: '封筒' },
  { id: 'n3', label: '長形3号（120 × 235 mm）★A4三つ折り・定形最大', widthMm: 120, heightMm: 235, category: '封筒' },
  { id: 'k2', label: '角形2号（240 × 332 mm）★A4そのまま入る', widthMm: 240, heightMm: 332, category: '封筒' },
  { id: 'k3', label: '角形3号（216 × 277 mm）★B5そのまま入る', widthMm: 216, heightMm: 277, category: '封筒' },
  { id: 'k8', label: '角形8号・給与袋（119 × 197 mm）★給与明細等', widthMm: 119, heightMm: 197, category: '封筒' },
  { id: 'y0', label: '洋形0号 / 洋長3（120 × 235 mm）★A4三つ折り横', widthMm: 120, heightMm: 235, category: '封筒' },
  { id: 'y2', label: '洋形2号（114 × 162 mm）★はがきが入る', widthMm: 114, heightMm: 162, category: '封筒' },

  // --- 写真・カード・ハガキ ---
  { id: 'postcard', label: '官製はがき（100 × 148 mm）', widthMm: 100, heightMm: 148, category: '写真・カード' },
  { id: 'ofuku_postcard', label: '往復はがき（200 × 148 mm）', widthMm: 200, heightMm: 148, category: '写真・カード' },
  { id: 'meishi', label: '名刺（55 × 91 mm / 4号）', widthMm: 55, heightMm: 91, category: '写真・カード' },
  { id: 'photo_l', label: '写真 L判（89 × 127 mm）', widthMm: 89, heightMm: 127, category: '写真・カード' },
  { id: 'photo_2l', label: '写真 2L判（127 × 178 mm）', widthMm: 127, heightMm: 178, category: '写真・カード' },

  // --- カスタム指定 ---
  { id: 'custom', label: 'カスタム（mmで直接指定）', widthMm: 210, heightMm: 297, category: 'その他' },
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
    if (std) return std.id;
    return sizeName;
  }
  if (widthMm && heightMm) {
    return `${Math.round(widthMm)}×${Math.round(heightMm)}mm`;
  }
  return '';
}
