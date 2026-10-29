/** 日本語フォント（BIZ UDゴシック：読みやすさを重視したユニバーサルデザインフォント） */
export const FONT_FAMILY = 'BIZ UDGothic';
export const FONT_STACK = `"${FONT_FAMILY}", "Hiragino Sans", "Noto Sans JP", sans-serif`;

const URLS = {
  regular: '/fonts/BIZUDGothic-Regular.ttf',
  bold: '/fonts/BIZUDGothic-Bold.ttf',
};

let loading: Promise<void> | null = null;

/** キャンバス描画用にフォントを読み込む */
export function ensureCanvasFonts(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      try {
        const reg = new FontFace(FONT_FAMILY, `url(${URLS.regular})`, { weight: '400' });
        const bold = new FontFace(FONT_FAMILY, `url(${URLS.bold})`, { weight: '700' });
        const [r, b] = await Promise.all([reg.load(), bold.load()]);
        document.fonts.add(r);
        document.fonts.add(b);
      } catch (e) {
        console.warn('フォントの読み込みに失敗しました', e);
        loading = null;
      }
    })();
  }
  return loading;
}

const bytesCache: Partial<Record<'regular' | 'bold', Promise<ArrayBuffer>>> = {};

/** PDF埋め込み用のフォントデータ */
export function fontBytes(kind: 'regular' | 'bold'): Promise<ArrayBuffer> {
  bytesCache[kind] ??= fetch(URLS[kind]).then((r) => {
    if (!r.ok) throw new Error('フォントの読み込みに失敗しました');
    return r.arrayBuffer();
  });
  return bytesCache[kind]!;
}
