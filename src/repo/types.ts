import type {
  NewTemplate,
  OutputRecord,
  Role,
  Session,
  Template,
  TemplateDefinitionPatch,
} from '../types';

/**
 * 保存の窓口（Repository）。
 * 画面はこのインターフェースだけを使い、保存先（IndexedDB / Firestore）を意識しない。
 */

/** 一度書き込んだら変更しないファイル置き場 */
export interface BlobStore {
  put(blob: Blob): Promise<string>;
  get(id: string): Promise<Blob>;
  remove(id: string): Promise<void>;
}

export interface TemplateRepository {
  /** 一覧を購読する。戻り値は購読解除関数 */
  subscribe(cb: (list: Template[]) => void, onError?: (e: Error) => void): () => void;
  get(id: string): Promise<Template | undefined>;
  create(t: NewTemplate): Promise<Template>;
  /** 定義（欄・計算式・マスク・作り直しデータ・名前）だけを更新する */
  updateDefinition(id: string, patch: TemplateDefinitionPatch): Promise<Template>;
  duplicate(id: string, newName: string): Promise<Template>;
  remove(id: string): Promise<void>;
}

export interface SessionRepository {
  list(): Promise<Session[]>;
  get(id: string): Promise<Session | undefined>;
  /** 必ず空の値で新しい入力を作る */
  createBlank(t: Template): Promise<Session>;
  createFrom(t: Template, values: Record<string, string>): Promise<Session>;
  saveValues(id: string, values: Record<string, string>): Promise<void>;
  markDone(id: string): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface OutputRepository {
  list(): Promise<OutputRecord[]>;
  get(id: string): Promise<OutputRecord | undefined>;
  add(r: Omit<OutputRecord, 'id' | 'createdAt'>): Promise<OutputRecord>;
  remove(id: string): Promise<void>;
}

export interface TeamService {
  /** 匿名ログインして現在の役割を返す（未参加なら null） */
  init(): Promise<{ role: Role | null; initialized: boolean }>;
  setup(memberCode: string, adminCode: string): Promise<void>;
  join(code: string, asAdmin: boolean): Promise<Role>;
  changeCodes(memberCode: string, adminCode: string): Promise<void>;
  leave(): Promise<void>;
}
