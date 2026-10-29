import type { NewTemplate, Template, TemplateDefinitionPatch } from '../types';
import { newId } from '../lib/id';
import { localDb } from './localDb';
import type { BlobStore, TemplateRepository } from './types';
import { collectBlobIds } from './templateUtil';

/** 端末内だけで動くファイル置き場（テスト・オフライン検証用） */
export class LocalBlobStore implements BlobStore {
  async put(blob: Blob) {
    const id = newId();
    await localDb.localBlobs.add({ id, blob });
    return id;
  }
  async get(id: string) {
    const r = await localDb.localBlobs.get(id);
    if (!r) throw new Error('ファイルが見つかりません');
    return r.blob;
  }
  async remove(id: string) {
    await localDb.localBlobs.delete(id);
  }
}

/** 端末内だけで動くテンプレート保存（テスト・オフライン検証用、Firestore版と同じ振る舞い） */
export class LocalTemplateRepository implements TemplateRepository {
  private listeners = new Set<(l: Template[]) => void>();
  private blobs: BlobStore;
  constructor(blobs: BlobStore) {
    this.blobs = blobs;
  }

  private async emit() {
    const list = (await localDb.localTemplates.toArray()).sort((a, b) => b.updatedAt - a.updatedAt);
    this.listeners.forEach((l) => l(list));
  }
  subscribe(cb: (l: Template[]) => void) {
    this.listeners.add(cb);
    void this.emit();
    return () => {
      this.listeners.delete(cb);
    };
  }
  get(id: string) {
    return localDb.localTemplates.get(id);
  }
  async create(nt: NewTemplate) {
    const now = Date.now();
    const t: Template = { ...structuredClone(nt), id: newId(), version: 1, createdAt: now, updatedAt: now };
    await localDb.localTemplates.add(t);
    await this.emit();
    return t;
  }
  async updateDefinition(id: string, patch: TemplateDefinitionPatch) {
    const cur = await this.get(id);
    if (!cur) throw new Error('テンプレートが見つかりません');
    const next: Template = { ...cur, ...structuredClone(patch), version: cur.version + 1, updatedAt: Date.now() };
    await localDb.localTemplates.put(next);
    await this.emit();
    return next;
  }
  async duplicate(id: string, newName: string) {
    const cur = await this.get(id);
    if (!cur) throw new Error('テンプレートが見つかりません');
    const { id: _id, version: _v, createdAt: _c, updatedAt: _u, ...rest } = cur;
    return this.create({ ...rest, name: newName, derivedFrom: undefined, variantLabel: undefined });
  }
  async remove(id: string) {
    const cur = await this.get(id);
    await localDb.localTemplates.delete(id);
    if (cur) {
      const others = await localDb.localTemplates.toArray();
      const used = new Set(others.flatMap(collectBlobIds));
      for (const b of collectBlobIds(cur)) if (!used.has(b)) await this.blobs.remove(b);
    }
    await this.emit();
  }
}
