import type { FieldDef } from '../types';
import { parseNumber } from './format';

export class CycleError extends Error {
  fieldIds: string[];
  constructor(fieldIds: string[]) {
    super('計算式が循環しています');
    this.fieldIds = fieldIds;
  }
}

/** 計算式の依存関係から循環を検出する。循環している欄のID一覧を返す（なければ空） */
export function findCycle(fields: FieldDef[]): string[] {
  const map = new Map(fields.map((f) => [f.id, f]));
  const state = new Map<string, 1 | 2>();
  const stack: string[] = [];
  let found: string[] = [];
  const visit = (id: string): boolean => {
    if (state.get(id) === 2) return false;
    if (state.get(id) === 1) {
      found = stack.slice(stack.indexOf(id));
      return true;
    }
    state.set(id, 1);
    stack.push(id);
    for (const t of map.get(id)?.formula ?? []) {
      if (map.has(t.fieldId) && visit(t.fieldId)) return true;
    }
    stack.pop();
    state.set(id, 2);
    return false;
  };
  for (const f of fields) if (visit(f.id)) break;
  return found;
}

/**
 * 計算式のある欄を、依存順に計算して値を埋めた新しい values を返す。
 * 元の values は変更しない。空欄は 0 として扱う。
 */
export function computeAll(
  fields: FieldDef[],
  values: Record<string, string>,
): Record<string, string> {
  const cycle = findCycle(fields);
  if (cycle.length) throw new CycleError(cycle);
  const map = new Map(fields.map((f) => [f.id, f]));
  const out: Record<string, string> = { ...values };
  const done = new Set<string>();
  const calc = (id: string): number => {
    const f = map.get(id);
    if (!f) return 0;
    if (!f.formula?.length) return parseNumber(out[id]);
    if (done.has(id)) return parseNumber(out[id]);
    let sum = 0;
    let any = false;
    for (const t of f.formula) {
      const tf = map.get(t.fieldId);
      if (!tf) continue;
      const hasValue = tf.formula?.length ? true : (out[t.fieldId] ?? '') !== '';
      if (hasValue) any = true;
      const v = calc(t.fieldId);
      sum += t.op === '-' ? -v : v;
    }
    out[id] = any ? String(sum) : '';
    done.add(id);
    return sum;
  };
  for (const f of fields) if (f.formula?.length) calc(f.id);
  return out;
}

/** 必須欄のうち未入力のものを返す */
export function missingRequired(fields: FieldDef[], values: Record<string, string>): FieldDef[] {
  return fields.filter((f) => f.required && !f.formula?.length && !(values[f.id] ?? '').trim());
}
