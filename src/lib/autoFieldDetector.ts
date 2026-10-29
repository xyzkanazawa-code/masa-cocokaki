import type { FieldDef, FieldType, Rect } from '../types';
import { loadCv } from './cv';
import { clamp, newId } from './id';

interface DetectedBox {
  rect: Rect; // 0-1 比率
  label: string;
  type: FieldType;
  align: 'left' | 'center' | 'right';
  comma?: boolean;
}

interface OcrText {
  text: string;
  rect: Rect; // 0-1 比率
  isNumeric: boolean;
}

/**
 * 写真から入力枠（フィールド）を自動検出・生成する
 */
export async function detectFormFieldsFromPhoto(
  canvas: HTMLCanvasElement,
  pageIndex = 0,
  onStatus?: (msg: string, progress?: number) => void,
): Promise<FieldDef[]> {
  onStatus?.('画像から罫線と枠を検出中…', 0.15);

  const W = canvas.width;
  const H = canvas.height;

  // 1. OpenCV でテーブルセル（四角い記入枠）を検出
  let cellRects: Rect[] = [];
  try {
    cellRects = await detectTableCells(canvas);
  } catch (err) {
    console.warn('セル枠検出で警告/スキップ:', err);
  }

  // 2. Tesseract.js で文字・項目名を OCR 解析
  onStatus?.('項目名と文字を読み取っています…', 0.4);
  const ocrTexts: OcrText[] = [];
  try {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('jpn', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          onStatus?.(`項目名を解析中（${Math.round(m.progress * 100)}%）…`, 0.4 + m.progress * 0.4);
        }
      },
    });
    try {
      const res = await worker.recognize(canvas, {}, { blocks: true, text: true });
      const blocks = res.data.blocks ?? [];
      for (const b of blocks) {
        for (const p of b.paragraphs ?? []) {
          for (const ln of p.lines ?? []) {
            const rawLine = ln.text.replace(/\s+/g, '').trim();
            if (rawLine) {
              const bw = ln.bbox.x1 - ln.bbox.x0;
              const bh = ln.bbox.y1 - ln.bbox.y0;
              if (bw > 6 && bh > 6 && bw < W * 0.95 && bh < H * 0.3) {
                const isNum = /^[\d\s,.\-¥￥円/()（）:：+＋]+$/.test(rawLine);
                ocrTexts.push({
                  text: rawLine,
                  rect: {
                    x: clamp(ln.bbox.x0 / W, 0, 1),
                    y: clamp(ln.bbox.y0 / H, 0, 1),
                    w: clamp(bw / W, 0.01, 1),
                    h: clamp(bh / H, 0.01, 1),
                  },
                  isNumeric: isNum,
                });
              }
            }

            // 単語単位でも保持
            for (const w of ln.words ?? []) {
              const raw = w.text.replace(/\s+/g, '').trim();
              if (!raw || raw === rawLine) continue;
              const bw = w.bbox.x1 - w.bbox.x0;
              const bh = w.bbox.y1 - w.bbox.y0;
              if (bw > 6 && bh > 6 && bw < W * 0.95 && bh < H * 0.3) {
                const isNum = /^[\d\s,.\-¥￥円/()（）:：+＋]+$/.test(raw);
                ocrTexts.push({
                  text: raw,
                  rect: {
                    x: clamp(w.bbox.x0 / W, 0, 1),
                    y: clamp(w.bbox.y0 / H, 0, 1),
                    w: clamp(bw / W, 0.01, 1),
                    h: clamp(bh / H, 0.01, 1),
                  },
                  isNumeric: isNum,
                });
              }
            }
          }
        }
      }
    } finally {
      await worker.terminate();
    }
  } catch (err) {
    console.warn('OCR解析中に警告/スキップ:', err);
  }

  onStatus?.('入力欄を組み立てています…', 0.85);

  const detectedBoxes: DetectedBox[] = [];

  // 3. セル枠とOCRテキストをマッチング
  // 見出しテキストかどうかを判定するヘルパー
  const analyzeLabel = (str: string): { label: string; type: FieldType; align: 'left' | 'center' | 'right'; comma?: boolean } | null => {
    const s = str.replace(/[：:【】\[\]()（）_＿]/g, '').trim();
    if (!s) return null;

    if (/(日\s*付|年\s*月\s*日|作\s*成\s*日|登\s*録\s*日|期\s*日)/.test(s)) {
      return { label: '日付', type: 'date', align: 'center' };
    }
    if (/(出\s*庫|発\s*車|始\s*業)/.test(s)) {
      return { label: '出庫時間', type: 'time', align: 'center' };
    }
    if (/(入\s*庫|到\s*着|終\s*業)/.test(s)) {
      return { label: '入庫時間', type: 'time', align: 'center' };
    }
    if (/(時\s*間|時\s*刻)/.test(s)) {
      return { label: '時間', type: 'time', align: 'center' };
    }
    if (/(運\s*賃)/.test(s)) {
      return { label: '運賃', type: 'currency', align: 'right', comma: true };
    }
    if (/(高\s*速|通\s*行)/.test(s)) {
      return { label: '高速代', type: 'currency', align: 'right', comma: true };
    }
    if (/(駐\s*車)/.test(s)) {
      return { label: '駐車代', type: 'currency', align: 'right', comma: true };
    }
    if (/(燃\s*料|ガソリン|給\s*油)/.test(s)) {
      return { label: '燃料代', type: 'currency', align: 'right', comma: true };
    }
    if (/(立\s*替)/.test(s)) {
      return { label: '立替金', type: 'currency', align: 'right', comma: true };
    }
    if (/(合\s*計|総\s*額)/.test(s)) {
      return { label: '合計', type: 'currency', align: 'right', comma: true };
    }
    if (/(小\s*計)/.test(s)) {
      return { label: '小計', type: 'currency', align: 'right', comma: true };
    }
    if (/(金\s*額|料\s*金|売\s*上|手\s*当|税)/.test(s)) {
      return { label: s.slice(0, 8), type: 'currency', align: 'right', comma: true };
    }
    if (/(車\s*番|車\s*両|号\s*車)/.test(s)) {
      return { label: '車両番号', type: 'number', align: 'right', comma: false };
    }
    if (/(メーター|実\s*車|走\s*行|距\s*離|km|キロ)/.test(s)) {
      return { label: s.slice(0, 8), type: 'number', align: 'right', comma: false };
    }
    if (/(氏\s*名|名\s*前|乗\s*務\s*員|ドライバー|担\s*当)/.test(s)) {
      return { label: '氏名', type: 'text', align: 'left' };
    }
    if (/(行\s*き\s*先|行\s*先|区\s*間)/.test(s)) {
      return { label: '行先', type: 'text', align: 'left' };
    }
    if (/(摘\s*要|備\s*考|内\s*容|メ\s*モ)/.test(s)) {
      return { label: '備考', type: 'text', align: 'left' };
    }
    if (s.length >= 2 && s.length <= 8 && !/^[0-9]+$/.test(s)) {
      return { label: s, type: 'text', align: 'left' };
    }
    return null;
  };

  // 各セルについて：
  // (A) セル内に手書き文字・数字があるか？
  // (B) セルの左または上に見出しラベルがあるか？
  // (C) セル自身が見出しセルか（その場合は右・下の空きセルを入力枠とする）
  const usedCellIndices = new Set<number>();

  for (let i = 0; i < cellRects.length; i++) {
    const cell = cellRects[i];
    // セル内にあるテキストを探す
    const insideTexts = ocrTexts.filter(
      (t) =>
        t.rect.x >= cell.x - 0.01 &&
        t.rect.y >= cell.y - 0.01 &&
        t.rect.x + t.rect.w <= cell.x + cell.w + 0.01 &&
        t.rect.y + t.rect.h <= cell.y + cell.h + 0.01,
    );

    // セル内に見出しらしきテキストがあるか？
    let cellHeading: { label: string; type: FieldType; align: 'left' | 'center' | 'right'; comma?: boolean } | null = null;
    let hasNumericInside = false;

    for (const t of insideTexts) {
      if (t.isNumeric) {
        hasNumericInside = true;
      }
      const parsed = analyzeLabel(t.text);
      if (parsed) {
        cellHeading = parsed;
      }
    }

    if (cellHeading && !hasNumericInside) {
      // このセルは見出しセル！ 右隣、または下隣にある「空きセル」を入力枠候補とする
      usedCellIndices.add(i);

      // 右隣のセルを探す
      const rightCellIdx = cellRects.findIndex(
        (c, idx) =>
          idx !== i &&
          !usedCellIndices.has(idx) &&
          Math.abs(c.y - cell.y) < cell.h * 0.4 &&
          c.x > cell.x &&
          c.x < cell.x + cell.w + 0.08,
      );

      if (rightCellIdx !== -1) {
        usedCellIndices.add(rightCellIdx);
        detectedBoxes.push({
          rect: cellRects[rightCellIdx],
          label: cellHeading.label,
          type: cellHeading.type,
          align: cellHeading.align,
          comma: cellHeading.comma,
        });
        continue;
      }

      // 下隣のセルを探す
      const bottomCellIdx = cellRects.findIndex(
        (c, idx) =>
          idx !== i &&
          !usedCellIndices.has(idx) &&
          Math.abs(c.x - cell.x) < cell.w * 0.4 &&
          c.y > cell.y &&
          c.y < cell.y + cell.h + 0.08,
      );

      if (bottomCellIdx !== -1) {
        usedCellIndices.add(bottomCellIdx);
        detectedBoxes.push({
          rect: cellRects[bottomCellIdx],
          label: cellHeading.label,
          type: cellHeading.type,
          align: cellHeading.align,
          comma: cellHeading.comma,
        });
        continue;
      }
    }

    // セル内に数字が入っている、または空きセルで近隣に見出しがある場合
    if (!usedCellIndices.has(i)) {
      // 左隣または上隣の見出しを探す
      let bestLabel: { label: string; type: FieldType; align: 'left' | 'center' | 'right'; comma?: boolean } | null = null;
      let minDist = Infinity;

      for (const t of ocrTexts) {
        const parsed = analyzeLabel(t.text);
        if (!parsed) continue;

        // 左側にある見出し
        const isLeft = t.rect.x < cell.x && Math.abs(t.rect.y + t.rect.h / 2 - (cell.y + cell.h / 2)) < cell.h * 0.6;
        // 上側にある見出し
        const isAbove = t.rect.y < cell.y && Math.abs(t.rect.x + t.rect.w / 2 - (cell.x + cell.w / 2)) < cell.w * 0.6;

        if (isLeft || isAbove) {
          const dist = Math.hypot(cell.x - t.rect.x, cell.y - t.rect.y);
          if (dist < minDist) {
            minDist = dist;
            bestLabel = parsed;
          }
        }
      }

      if (bestLabel) {
        usedCellIndices.add(i);
        detectedBoxes.push({
          rect: cell,
          label: bestLabel.label,
          type: bestLabel.type,
          align: bestLabel.align,
          comma: bestLabel.comma,
        });
      } else if (hasNumericInside) {
        // 数字が入っている枠（手書き伝票など）
        usedCellIndices.add(i);
        detectedBoxes.push({
          rect: cell,
          label: `項目${detectedBoxes.length + 1}`,
          type: 'currency',
          align: 'right',
          comma: true,
        });
      }
    }
  }

  // 4. セルが見つからなかった、またはセル枠が少ない場合：
  // 見出しテキストの右側に直接入力欄を生成
  for (const t of ocrTexts) {
    const parsed = analyzeLabel(t.text);
    if (!parsed) continue;

    // 既にこのラベルの近くに枠が割り当てられているか？
    const alreadyNear = detectedBoxes.some(
      (b) =>
        Math.hypot(b.rect.x - t.rect.x, b.rect.y - t.rect.y) < 0.15 ||
        (b.label === parsed.label && Math.abs(b.rect.y - t.rect.y) < 0.05),
    );
    if (alreadyNear) continue;

    // 見出しの右側に入力枠を作成
    const fieldW = parsed.type === 'currency' || parsed.type === 'number' ? 0.18 : 0.25;
    const fieldH = Math.max(0.035, t.rect.h * 1.3);
    const fieldX = Math.min(0.98 - fieldW, t.rect.x + t.rect.w + 0.02);
    const fieldY = clamp(t.rect.y - (fieldH - t.rect.h) / 2, 0, 0.95);

    detectedBoxes.push({
      rect: { x: fieldX, y: fieldY, w: fieldW, h: fieldH },
      label: parsed.label,
      type: parsed.type,
      align: parsed.align,
      comma: parsed.comma,
    });
  }

  // 5. 手書き数字・記入文字が検出されているが枠になっていないものを拾う
  for (const t of ocrTexts) {
    if (!t.isNumeric) continue;
    const alreadyCovered = detectedBoxes.some(
      (b) =>
        t.rect.x >= b.rect.x - 0.02 &&
        t.rect.y >= b.rect.y - 0.02 &&
        t.rect.x + t.rect.w <= b.rect.x + b.rect.w + 0.02 &&
        t.rect.y + t.rect.h <= b.rect.y + b.rect.h + 0.02,
    );
    if (alreadyCovered) continue;

    // 手書き数字自体の領域を入力欄とする
    detectedBoxes.push({
      rect: {
        x: clamp(t.rect.x - 0.01, 0, 0.95),
        y: clamp(t.rect.y - 0.005, 0, 0.95),
        w: clamp(t.rect.w + 0.03, 0.08, 0.4),
        h: clamp(t.rect.h + 0.01, 0.03, 0.1),
      },
      label: `入力欄${detectedBoxes.length + 1}`,
      type: 'currency',
      align: 'right',
      comma: true,
    });
  }

  // 6. 重複排除（重なっている枠の統合または間引き）
  const filtered = filterOverlappingBoxes(detectedBoxes);

  // 7. 上から下、左から右の順にソートして連番やFieldDefに変換
  filtered.sort((a, b) => {
    const dy = a.rect.y - b.rect.y;
    if (Math.abs(dy) > 0.03) return dy;
    return a.rect.x - b.rect.x;
  });

  // 同じラベルが複数ある場合に「運賃1」「運賃2」のように番号を付与
  const labelCounts: Record<string, number> = {};
  filtered.forEach((b) => {
    labelCounts[b.label] = (labelCounts[b.label] || 0) + 1;
  });
  const currentCount: Record<string, number> = {};

  const fields: FieldDef[] = filtered.map((b) => {
    let finalLabel = b.label;
    if (labelCounts[b.label] > 1) {
      currentCount[b.label] = (currentCount[b.label] || 0) + 1;
      finalLabel = `${b.label}${currentCount[b.label]}`;
    }

    return {
      id: newId(),
      page: pageIndex,
      rect: {
        x: Number(b.rect.x.toFixed(4)),
        y: Number(b.rect.y.toFixed(4)),
        w: Number(b.rect.w.toFixed(4)),
        h: Number(b.rect.h.toFixed(4)),
      },
      label: finalLabel,
      type: b.type,
      required: false,
      comma: b.comma,
      align: b.align,
    };
  });

  onStatus?.(`検出完了（${fields.length}箇所の入力欄を生成）`, 1);
  return fields;
}

/**
 * OpenCV による帳票テーブルのセル（四角枠）検出
 */
async function detectTableCells(src: HTMLCanvasElement): Promise<Rect[]> {
  const cv = await loadCv();
  const mats: any[] = [];
  const m = <T>(x: T) => (mats.push(x), x);

  const W = src.width;
  const H = src.height;
  const cells: Rect[] = [];

  try {
    const rgba = m(cv.imread(src));
    const gray = m(new cv.Mat());
    cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);

    const inv = m(new cv.Mat());
    // 適応的二値化
    const block = Math.max(15, (Math.round(Math.max(W, H) / 50) | 1));
    cv.adaptiveThreshold(gray, inv, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, block, 10);

    // 水平線・垂直線の抽出
    const hLen = Math.max(15, Math.round(W / 30));
    const vLen = Math.max(15, Math.round(H / 30));

    const hKernel = m(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(hLen, 1)));
    const vKernel = m(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(1, vLen)));

    const hLines = m(new cv.Mat());
    cv.morphologyEx(inv, hLines, cv.MORPH_OPEN, hKernel);

    const vLines = m(new cv.Mat());
    cv.morphologyEx(inv, vLines, cv.MORPH_OPEN, vKernel);

    // 格子マスクの合成
    const tableGrid = m(new cv.Mat());
    cv.bitwise_or(hLines, vLines, tableGrid);

    // 輪郭検出でセル（囲まれた四角形）を探す
    const contours = m(new cv.MatVector());
    const hier = m(new cv.Mat());
    cv.findContours(tableGrid, contours, hier, cv.RETR_TREE, cv.CHAIN_APPROX_SIMPLE);

    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i);
      const r = cv.boundingRect(c);
      c.delete();

      // 小さすぎるノイズや、画像全体に近すぎる外枠は除外
      const minW = Math.max(30, W * 0.04);
      const minH = Math.max(16, H * 0.015);
      const maxW = W * 0.92;
      const maxH = H * 0.85;

      if (r.width >= minW && r.height >= minH && r.width <= maxW && r.height <= maxH) {
        cells.push({
          x: clamp(r.x / W, 0, 1),
          y: clamp(r.y / H, 0, 1),
          w: clamp(r.width / W, 0.01, 1),
          h: clamp(r.height / H, 0.01, 1),
        });
      }
    }
  } finally {
    mats.forEach((x) => x.delete?.());
  }

  return cells;
}

/**
 * 重複する矩形を間引き・統合する
 */
function filterOverlappingBoxes(boxes: DetectedBox[]): DetectedBox[] {
  const result: DetectedBox[] = [];

  for (const b of boxes) {
    // 既存の矩形と著しく重なっているか確認 (IoU または 内包判定)
    const isDup = result.some((ex) => {
      const x1 = Math.max(b.rect.x, ex.rect.x);
      const y1 = Math.max(b.rect.y, ex.rect.y);
      const x2 = Math.min(b.rect.x + b.rect.w, ex.rect.x + ex.rect.w);
      const y2 = Math.min(b.rect.y + b.rect.h, ex.rect.y + ex.rect.h);

      if (x2 <= x1 || y2 <= y1) return false;
      const interArea = (x2 - x1) * (y2 - y1);
      const areaA = b.rect.w * b.rect.h;
      const areaB = ex.rect.w * ex.rect.h;

      // どちらかの面積の70%以上が重なっている場合は重複とみなす
      return interArea / Math.min(areaA, areaB) > 0.65;
    });

    if (!isDup) {
      result.push(b);
    }
  }

  return result;
}
