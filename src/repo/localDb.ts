import Dexie, { type Table } from 'dexie';
import type { OutputRecord, Session, Template } from '../types';

interface BlobRow {
  id: string;
  blob: Blob;
}

/** 端末内の保存（IndexedDB） */
class CocokakiDB extends Dexie {
  sessions!: Table<Session, string>;
  outputs!: Table<OutputRecord, string>;
  blobCache!: Table<BlobRow, string>;
  localTemplates!: Table<Template, string>;
  localBlobs!: Table<BlobRow, string>;
  kv!: Table<{ key: string; value: unknown }, string>;

  constructor() {
    super('cocokaki');
    this.version(1).stores({
      sessions: 'id, templateId, status, updatedAt',
      outputs: 'id, sessionId, templateId, createdAt',
      blobCache: 'id',
      localTemplates: 'id, updatedAt',
      localBlobs: 'id',
      kv: 'key',
    });
  }
}

export const localDb = new CocokakiDB();
