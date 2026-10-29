import type { RebuildLine, RebuildPage, RebuildText } from '../types';
import { cleanPhoto, DEFAULT_CLEAN, detectTableLines } from './cv';
import { newId } from './id';

/**
 * モードB「きれいに作り直すモード」
 * 1. 写真を白黒補正してノイズを除去
 * 2. OpenCVで横線・縦線（罫線・枠）を検出し、まっすぐなベクター線に変換
 * 3. 罫線を消した文字だけの画像に対して日本語OCR（Tesseract.js）を実行し、文字と座標を取得
 * 4. きれいなUDフォントの文字＋まっすぐな線の RebuildPage を生成
 */
export async function rebuildFromPhoto(
  src: HTMLCanvasElement,
  pageIndex: number,
  onStatus?: (msg: string, progress?: number) => void,
): Promise<RebuildPage> {
  onStatus?.('画像を整えています…', 0.1);
  const cleaned = await cleanPhoto(src, {
    ...DEFAULT_CLEAN,
    deskew: true,
    binarize: true,
    shadow: 75,
    denoise: 55,
  });

  onStatus?.('罫線と枠を検出しています…', 0.3);
  const { lines: rawLines, textOnly } = await detectTableLines(cleaned);
  const W = cleaned.width;
  const H = cleaned.height;

  const lines: RebuildLine[] = rawLines.map((l) => ({
    id: newId(),
    x1: l.x1 / W,
    y1: l.y1 / H,
    x2: l.x2 / W,
    y2: l.y2 / H,
    width: Math.max(0.001, Math.min(0.005, l.width / W)),
  }));

  onStatus?.('文字を読み取っています（OCR）…', 0.45);
  const texts: RebuildText[] = [];
  try {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('jpn', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          onStatus?.(`文字を読み取っています（${Math.round(m.progress * 100)}%）…`, 0.45 + m.progress * 0.5);
        }
      },
    });
    try {
      const res = await worker.recognize(textOnly, {}, { blocks: true, text: true });
      const blocks = res.data.blocks ?? [];
      for (const b of blocks) {
        for (const p of b.paragraphs ?? []) {
          for (const ln of p.lines ?? []) {
            // 単語単位または行単位でまとめる（離れている塊は分割）
            const groups = groupWords(ln.words ?? [], W);
            for (const g of groups) {
              const cleanedText = g.text.replace(/\s+/g, '').trim();
              if (!cleanedText) continue;
              const bw = Math.max(12, g.x1 - g.x0);
              const bh = Math.max(12, g.y1 - g.y0);
              if (bh > H * 0.15 || bw < 4) continue;
              texts.push({
                id: newId(),
                rect: {
                  x: Math.max(0, (g.x0 - 2) / W),
                  y: Math.max(0, (g.y0 - 2) / H),
                  w: Math.min(1, (bw + 8) / W),
                  h: Math.min(1, (bh + 6) / H),
                },
                text: cleanedText,
                fontSize: Math.max(0.011, Math.min(0.04, (bh * 0.78) / W)),
                bold: bh > H * 0.032,
                align: 'left',
              });
            }
          }
        }
      }
    } finally {
      await worker.terminate();
    }
  } catch (e) {
    console.warn('OCRの実行中にエラーが発生しました:', e);
  }

  onStatus?.('完了しました', 1);
  return { page: pageIndex, lines, texts };
}

interface WordBox {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

function groupWords(words: WordBox[], pageW: number) {
  const valid = words.filter((w) => w.text.trim() && w.confidence > 25);
  if (!valid.length) return [];
  const gapLimit = pageW * 0.025;
  const out: { text: string; x0: number; y0: number; x1: number; y1: number }[] = [];
  let cur = {
    text: valid[0].text,
    x0: valid[0].bbox.x0,
    y0: valid[0].bbox.y0,
    x1: valid[0].bbox.x1,
    y1: valid[0].bbox.y1,
  };
  for (const w of valid.slice(1)) {
    if (w.bbox.x0 - cur.x1 <= gapLimit) {
      cur.text += w.text;
      cur.x1 = Math.max(cur.x1, w.bbox.x1);
      cur.y0 = Math.min(cur.y0, w.bbox.y0);
      cur.y1 = Math.max(cur.y1, w.bbox.y1);
    } else {
      out.push(cur);
      cur = {
        text: w.text,
        x0: w.bbox.x0,
        y0: w.bbox.y0,
        x1: w.bbox.x1,
        y1: w.bbox.y1,
      };
    }
  }
  out.push(cur);
  return out;
}
