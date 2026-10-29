// ココカキ 共通の型定義
// 座標はすべてページに対する比率（0〜1）で保持する。

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type TemplateKind = 'pdf' | 'photo' | 'rebuilt';

export type FieldType = 'number' | 'currency' | 'text' | 'date' | 'time';

export interface FormulaTerm {
  fieldId: string;
  op: '+' | '-';
}

export interface FieldDef {
  id: string;
  page: number;
  rect: Rect;
  label: string;
  type: FieldType;
  required: boolean;
  /** 数字の最大桁数（数字・金額のみ） */
  maxDigits?: number;
  /** カンマ区切り表示（数字・金額のみ） */
  comma?: boolean;
  align: 'left' | 'center' | 'right';
  /** 文字サイズ（ページ幅に対する比率）。未指定なら欄の高さから自動 */
  fontSize?: number;
  /** 指定されていれば自動計算欄（読み取り専用） */
  formula?: FormulaTerm[];
}

/** テンプレートの文字修正（マスク＋差し替え文字） */
export interface Annotation {
  id: string;
  page: number;
  rect: Rect;
  /** マスク色（null なら塗らない） */
  maskColor: string | null;
  text: string;
  /** ページ幅に対する比率 */
  fontSize: number;
  textColor: string;
  bold: boolean;
  align: 'left' | 'center' | 'right';
}

/** PDF のテキストレイヤーの1要素 */
export interface PdfTextItem {
  str: string;
  rect: Rect;
}

export interface RebuildLine {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** 線の太さ（ページ幅に対する比率） */
  width: number;
}

export interface RebuildText {
  id: string;
  rect: Rect;
  text: string;
  fontSize: number;
  bold: boolean;
  align: 'left' | 'center' | 'right';
}

/** モードB「きれいに作り直す」のベクターデータ（1ページ分） */
export interface RebuildPage {
  page: number;
  lines: RebuildLine[];
  texts: RebuildText[];
}

export interface PageDef {
  index: number;
  /** 背景画像のピクセルサイズ */
  width: number;
  height: number;
  /** 表示用の背景画像（読み取り専用・変更しない） */
  bgBlobId: string;
  /** PDF のページサイズ(pt) */
  pdfWidth?: number;
  pdfHeight?: number;
  textItems?: PdfTextItem[];
  /** 用紙サイズ設定（A4, A3等またはカスタムmm） */
  paperSizeName?: string;
  widthMm?: number;
  heightMm?: number;
}

export interface Template {
  id: string;
  name: string;
  kind: TemplateKind;
  pages: PageDef[];
  /** 元ファイル（PDF / 写真）。登録時に1回だけ書き込み、以後変更しない */
  sourceBlobId?: string;
  sourceMime?: string;
  thumbBlobId?: string;
  fields: FieldDef[];
  annotations: Annotation[];
  rebuild?: RebuildPage[];
  /** 派生元のテンプレート（補正版・作り直し版の場合） */
  derivedFrom?: string;
  /** 派生の種類 */
  variantLabel?: string;
  version: number;
  createdAt: number;
  updatedAt: number;
}

/** テンプレートの「定義」部分だけを更新するためのパッチ（背景・元ファイルは型として変更不可） */
export type TemplateDefinitionPatch = Partial<
  Pick<Template, 'name' | 'fields' | 'annotations' | 'rebuild'>
>;

export type NewTemplate = Omit<Template, 'id' | 'version' | 'createdAt' | 'updatedAt'>;

/** 入力データ（テンプレートとは完全に別に保存） */
export interface Session {
  id: string;
  templateId: string;
  templateName: string;
  templateVersion: number;
  values: Record<string, string>;
  status: 'draft' | 'done';
  createdAt: number;
  updatedAt: number;
}

/** 出力履歴 */
export interface OutputRecord {
  id: string;
  sessionId: string;
  templateId: string;
  templateName: string;
  /** 出力時のテンプレート定義のスナップショット（再出力用） */
  templateSnapshot: Template;
  values: Record<string, string>;
  format: 'pdf' | 'png' | 'jpeg';
  thumbDataUrl?: string;
  createdAt: number;
}

export type Role = 'admin' | 'member';
