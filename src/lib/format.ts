import type { FieldDef } from '../types';

export function isNumeric(f: Pick<FieldDef, 'type'>): boolean {
  return f.type === 'number' || f.type === 'currency';
}

/** 入力文字列から数字（と先頭のマイナス）だけを取り出す */
export function sanitizeNumber(raw: string, maxDigits?: number): string {
  const s = toHalfWidth(raw);
  const neg = s.trim().startsWith('-');
  let digits = s.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
  if (maxDigits && maxDigits > 0) digits = digits.slice(0, maxDigits);
  if (!digits) return neg ? '-' : '';
  return (neg ? '-' : '') + digits;
}

export function toHalfWidth(s: string): string {
  return s
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[ー−－]/g, '-')
    .replace(/[，、]/g, ',');
}

export function parseNumber(v: string | undefined): number {
  if (!v) return 0;
  const n = Number(toHalfWidth(v).replace(/[^0-9-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export function withComma(n: number | string): string {
  const s = String(n);
  const neg = s.startsWith('-');
  const d = s.replace(/^-/, '');
  return (neg ? '-' : '') + d.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 表示用の整形（金額はカンマ区切り、日付・時間はそのまま） */
export function formatValue(f: FieldDef, v: string | undefined): string {
  if (v == null || v === '') return '';
  if (isNumeric(f)) {
    if (v === '-') return v;
    const useComma = f.comma ?? f.type === 'currency';
    return useComma ? withComma(v) : v;
  }
  if (f.type === 'date') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (m) return `${m[1]}/${m[2]}/${m[3]}`;
  }
  return v;
}

export const FIELD_TYPE_LABEL: Record<FieldDef['type'], string> = {
  number: '数字',
  currency: '金額',
  text: '文字',
  date: '日付',
  time: '時間',
};
