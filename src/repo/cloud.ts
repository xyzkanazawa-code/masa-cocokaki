import {
  Bytes,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, TEAM_ID } from '../firebase';
import type { NewTemplate, Template, TemplateDefinitionPatch } from '../types';
import { newId } from '../lib/id';
import { localDb } from './localDb';
import type { BlobStore, TemplateRepository } from './types';
import { collectBlobIds } from './templateUtil';

const CHUNK = 900_000;
const teamPath = `teams/${TEAM_ID}`;

/**
 * Firestore を使ったファイル置き場。
 * 1ドキュメント1MBの制限があるため、約900KBごとに分割して保存する。
 * 一度書いたら更新しない（ルールでも update を禁止）。端末側にもキャッシュする。
 */
export class FirestoreBlobStore implements BlobStore {
  async put(blob: Blob): Promise<string> {
    const id = newId();
    const buf = new Uint8Array(await blob.arrayBuffer());
    const n = Math.max(1, Math.ceil(buf.length / CHUNK));
    for (let i = 0; i < n; i += 8) {
      const batch = writeBatch(db);
      for (let j = i; j < Math.min(n, i + 8); j++) {
        batch.set(doc(db, `${teamPath}/blobs/${id}/chunks/${String(j).padStart(4, '0')}`), {
          i: j,
          data: Bytes.fromUint8Array(buf.subarray(j * CHUNK, (j + 1) * CHUNK)),
        });
      }
      await batch.commit();
    }
    await setDoc(doc(db, `${teamPath}/blobs/${id}`), {
      mime: blob.type || 'application/octet-stream',
      size: buf.length,
      chunks: n,
      createdAt: Date.now(),
    });
    await localDb.blobCache.put({ id, blob });
    return id;
  }

  async get(id: string): Promise<Blob> {
    const cached = await localDb.blobCache.get(id);
    if (cached) return cached.blob;
    const meta = await getDoc(doc(db, `${teamPath}/blobs/${id}`));
    if (!meta.exists()) throw new Error('ファイルが見つかりません');
    const { mime, chunks } = meta.data() as { mime: string; chunks: number };
    const snap = await getDocs(collection(db, `${teamPath}/blobs/${id}/chunks`));
    const parts = snap.docs
      .map((d) => d.data() as { i: number; data: Bytes })
      .sort((a, b) => a.i - b.i);
    if (parts.length !== chunks) throw new Error('ファイルの読み込みに失敗しました');
    const blob = new Blob(
      parts.map((p) => p.data.toUint8Array() as Uint8Array<ArrayBuffer>),
      { type: mime },
    );
    await localDb.blobCache.put({ id, blob });
    return blob;
  }

  async remove(id: string): Promise<void> {
    const snap = await getDocs(collection(db, `${teamPath}/blobs/${id}/chunks`));
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, `${teamPath}/blobs/${id}`));
    await batch.commit();
    await localDb.blobCache.delete(id);
  }
}

interface TemplateDoc {
  name: string;
  updatedAt: number;
  data: string;
}

/** 共有テンプレート（Firestore） */
export class FirestoreTemplateRepository implements TemplateRepository {
  private cache: Template[] = [];
  private blobs: BlobStore;
  constructor(blobs: BlobStore) {
    this.blobs = blobs;
  }

  subscribe(cb: (list: Template[]) => void, onError?: (e: Error) => void) {
    return onSnapshot(
      collection(db, `${teamPath}/templates`),
      (snap) => {
        this.cache = snap.docs
          .map((d) => JSON.parse((d.data() as TemplateDoc).data) as Template)
          .sort((a, b) => b.updatedAt - a.updatedAt);
        cb(this.cache);
      },
      (e) => onError?.(e),
    );
  }

  async get(id: string) {
    const hit = this.cache.find((t) => t.id === id);
    if (hit) return structuredClone(hit);
    const d = await getDoc(doc(db, `${teamPath}/templates/${id}`));
    return d.exists() ? (JSON.parse((d.data() as TemplateDoc).data) as Template) : undefined;
  }

  private async write(t: Template) {
    await setDoc(doc(db, `${teamPath}/templates/${t.id}`), {
      name: t.name,
      updatedAt: t.updatedAt,
      data: JSON.stringify(t),
    } satisfies TemplateDoc);
  }

  async create(nt: NewTemplate) {
    const now = Date.now();
    const t: Template = { ...structuredClone(nt), id: newId(), version: 1, createdAt: now, updatedAt: now };
    await this.write(t);
    return t;
  }

  async updateDefinition(id: string, patch: TemplateDefinitionPatch) {
    const cur = await this.get(id);
    if (!cur) throw new Error('テンプレートが見つかりません');
    const next: Template = {
      ...cur,
      ...structuredClone(patch),
      version: cur.version + 1,
      updatedAt: Date.now(),
    };
    await this.write(next);
    return next;
  }

  async duplicate(id: string, newName: string) {
    const cur = await this.get(id);
    if (!cur) throw new Error('テンプレートが見つかりません');
    // 画像ファイルは変更されないので共有してよい（同じ blobId を参照）
    const { id: _id, version: _v, createdAt: _c, updatedAt: _u, ...rest } = cur;
    return this.create({ ...rest, name: newName, derivedFrom: undefined, variantLabel: undefined });
  }

  async remove(id: string) {
    const cur = await this.get(id);
    await deleteDoc(doc(db, `${teamPath}/templates/${id}`));
    if (!cur) return;
    const stillUsed = new Set(this.cache.filter((t) => t.id !== id).flatMap(collectBlobIds));
    for (const b of collectBlobIds(cur)) {
      if (!stillUsed.has(b)) await this.blobs.remove(b).catch(() => undefined);
    }
  }
}
