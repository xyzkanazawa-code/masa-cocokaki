import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { computeAll, CycleError, findCycle, missingRequired } from '../lib/calc';
import { formatValue, sanitizeNumber, withComma } from '../lib/format';
import { sha256 } from '../lib/id';
import { LocalSessionRepository } from '../repo/localSessions';
import { LocalBlobStore, LocalTemplateRepository } from '../repo/localTemplates';
import type { FieldDef } from '../types';

describe('ココカキ：自動計算と数値フォーマット', () => {
  const sampleFields: FieldDef[] = [
    {
      id: 'fare',
      page: 0,
      rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.05 },
      label: '運賃',
      type: 'currency',
      required: true,
      comma: true,
      align: 'right',
    },
    {
      id: 'highway',
      page: 0,
      rect: { x: 0.1, y: 0.2, w: 0.2, h: 0.05 },
      label: '高速代',
      type: 'currency',
      required: false,
      comma: true,
      align: 'right',
    },
    {
      id: 'parking',
      page: 0,
      rect: { x: 0.1, y: 0.3, w: 0.2, h: 0.05 },
      label: '駐車代',
      type: 'currency',
      required: false,
      comma: true,
      align: 'right',
    },
    {
      id: 'expTotal',
      page: 0,
      rect: { x: 0.1, y: 0.4, w: 0.2, h: 0.05 },
      label: '経費計',
      type: 'currency',
      required: false,
      comma: true,
      align: 'right',
      formula: [
        { fieldId: 'highway', op: '+' },
        { fieldId: 'parking', op: '+' },
      ],
    },
    {
      id: 'netTotal',
      page: 0,
      rect: { x: 0.1, y: 0.5, w: 0.2, h: 0.05 },
      label: '差引納金額',
      type: 'currency',
      required: false,
      comma: true,
      align: 'right',
      formula: [
        { fieldId: 'fare', op: '+' },
        { fieldId: 'expTotal', op: '-' },
      ],
    },
  ];

  it('足し算・引き算の計算式が自動計算されること', () => {
    const out = computeAll(sampleFields, {
      fare: '85000',
      highway: '4200',
      parking: '1800',
    });
    expect(out.expTotal).toBe('6000');
    expect(out.netTotal).toBe('79000');
    expect(formatValue(sampleFields[4], out.netTotal)).toBe('79,000');
  });

  it('循環参照を検出できること', () => {
    const cyclic: FieldDef[] = [
      {
        ...sampleFields[0],
        id: 'a',
        formula: [{ fieldId: 'b', op: '+' }],
      },
      {
        ...sampleFields[1],
        id: 'b',
        formula: [{ fieldId: 'a', op: '+' }],
      },
    ];
    expect(findCycle(cyclic).length).toBeGreaterThan(0);
    expect(() => computeAll(cyclic, {})).toThrow(CycleError);
  });

  it('必須未入力を正しく判定し、桁数制限・カンマ表示が機能すること', () => {
    expect(missingRequired(sampleFields, {}).map((f) => f.id)).toEqual(['fare']);
    expect(missingRequired(sampleFields, { fare: '1000' })).toEqual([]);
    expect(sanitizeNumber('１２，３４５６７', 5)).toBe('12345');
    expect(withComma('1234567')).toBe('1,234,567');
  });
});

describe('ココカキ：最重要ルール（空白テンプレート保護・データ分離）', () => {
  it('テンプレート一覧から開いた時は必ず空白から始まり、元のテンプレートBlobが不変であること', async () => {
    const blobs = new LocalBlobStore();
    const templates = new LocalTemplateRepository(blobs);
    const sessions = new LocalSessionRepository();

    const originalBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const originalBlob = new Blob([originalBytes], { type: 'image/png' });
    const beforeHash = await sha256(originalBlob);
    const bgBlobId = await blobs.put(originalBlob);

    const tpl = await templates.create({
      name: 'テスト精算書',
      kind: 'photo',
      pages: [{ index: 0, width: 800, height: 1000, bgBlobId, paperSizeName: 'A4', widthMm: 210, heightMm: 297 }],
      sourceBlobId: bgBlobId,
      sourceMime: 'image/png',
      fields: [
        {
          id: 'f1',
          page: 0,
          rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.05 },
          label: '運賃',
          type: 'currency',
          required: true,
          comma: true,
          align: 'right',
        },
      ],
      annotations: [],
    });

    // 1回目の入力セッションを作成して値を書き込む
    const s1 = await sessions.createBlank(tpl);
    expect(s1.values).toEqual({});
    await sessions.saveValues(s1.id, { f1: '54000' });

    // 2回目にテンプレート一覧から選んだとき、前の入力内容が残っておらず必ず空白であること
    const s2 = await sessions.createBlank(tpl);
    expect(s2.values).toEqual({});

    // テンプレート本体にも入力値が入っておらず、元画像Blobのハッシュも完全に一致すること
    const fetchedTpl = await templates.get(tpl.id);
    expect(fetchedTpl).toBeDefined();
    expect('values' in (fetchedTpl as object)).toBe(false);
    const afterBlob = await blobs.get(bgBlobId);
    const afterHash = await sha256(afterBlob);
    expect(afterHash).toBe(beforeHash);
  });
});
