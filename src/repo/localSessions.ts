import type { OutputRecord, Session, Template } from '../types';
import { newId } from '../lib/id';
import { localDb } from './localDb';
import type { OutputRepository, SessionRepository } from './types';

/** 入力データ（Session）は端末内にだけ保存する */
export class LocalSessionRepository implements SessionRepository {
  async list() {
    return (await localDb.sessions.toArray()).sort((a, b) => b.updatedAt - a.updatedAt);
  }
  get(id: string) {
    return localDb.sessions.get(id);
  }
  async createBlank(t: Template): Promise<Session> {
    return this.createFrom(t, {});
  }
  async createFrom(t: Template, values: Record<string, string>): Promise<Session> {
    const now = Date.now();
    const s: Session = {
      id: newId(),
      templateId: t.id,
      templateName: t.name,
      templateVersion: t.version,
      values: { ...values },
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    };
    await localDb.sessions.add(s);
    return s;
  }
  async saveValues(id: string, values: Record<string, string>) {
    await localDb.sessions.update(id, { values: { ...values }, updatedAt: Date.now() });
  }
  async markDone(id: string) {
    await localDb.sessions.update(id, { status: 'done', updatedAt: Date.now() });
  }
  async remove(id: string) {
    await localDb.sessions.delete(id);
  }
}

export class LocalOutputRepository implements OutputRepository {
  async list() {
    return (await localDb.outputs.toArray()).sort((a, b) => b.createdAt - a.createdAt);
  }
  get(id: string) {
    return localDb.outputs.get(id);
  }
  async add(r: Omit<OutputRecord, 'id' | 'createdAt'>): Promise<OutputRecord> {
    const rec: OutputRecord = {
      ...structuredClone(r),
      id: newId(),
      createdAt: Date.now(),
    };
    await localDb.outputs.add(rec);
    return rec;
  }
  async remove(id: string) {
    await localDb.outputs.delete(id);
  }
}
