import type { Role } from '../types';
import { localDb } from './localDb';
import type { TeamService } from './types';

interface LocalTeam {
  memberCode: string;
  adminCode: string;
  role: Role | null;
}

/** 端末内だけで動くチーム（テスト・オフライン検証用） */
export class LocalTeamService implements TeamService {
  private async load(): Promise<LocalTeam | undefined> {
    return (await localDb.kv.get('team'))?.value as LocalTeam | undefined;
  }
  private async save(t: LocalTeam) {
    await localDb.kv.put({ key: 'team', value: t });
  }
  async init() {
    const t = await this.load();
    return { role: t?.role ?? null, initialized: !!t };
  }
  async setup(memberCode: string, adminCode: string) {
    await this.save({ memberCode, adminCode, role: 'admin' });
  }
  async join(code: string, asAdmin: boolean): Promise<Role> {
    const t = await this.load();
    if (!t) throw new Error('初期設定がされていません');
    const ok = asAdmin ? code === t.adminCode : code === t.memberCode;
    if (!ok) throw new Error('コードが違います');
    const role: Role = asAdmin ? 'admin' : 'member';
    await this.save({ ...t, role });
    return role;
  }
  async changeCodes(memberCode: string, adminCode: string) {
    const t = await this.load();
    await this.save({ memberCode, adminCode, role: t?.role ?? 'admin' });
  }
  async leave() {
    const t = await this.load();
    if (t) await this.save({ ...t, role: null });
  }
}
