import { signInAnonymously } from 'firebase/auth';
import { deleteDoc, doc, getDoc, setDoc, writeBatch } from 'firebase/firestore';
import { auth, db, TEAM_ID } from '../firebase';
import type { Role } from '../types';
import type { TeamService } from './types';

const secretRef = () => doc(db, `teamSecrets/${TEAM_ID}`);
const teamRef = () => doc(db, `teams/${TEAM_ID}`);
const memberRef = () => doc(db, `teams/${TEAM_ID}/members/${auth.currentUser!.uid}`);

/**
 * チームコード方式の参加。
 * コードは誰も読めない teamSecrets に保存し、Firestore のルールで照合する。
 */
export class FirestoreTeamService implements TeamService {
  async init() {
    await auth.authStateReady();
    if (!auth.currentUser) await signInAnonymously(auth);
    const [team, me] = await Promise.all([
      getDoc(teamRef()).catch(() => null),
      getDoc(memberRef()).catch(() => null),
    ]);
    const role = me?.exists() ? ((me.data().role as Role) ?? null) : null;
    return { role, initialized: !!team?.exists() };
  }

  async setup(memberCode: string, adminCode: string) {
    const b = writeBatch(db);
    b.set(secretRef(), { memberCode, adminCode });
    b.set(teamRef(), { initialized: true, createdAt: Date.now() });
    b.set(memberRef(), { role: 'admin', code: adminCode, joinedAt: Date.now() });
    try {
      await b.commit();
    } catch {
      throw new Error('初期設定に失敗しました（すでに設定済みの可能性があります）');
    }
  }

  async join(code: string, asAdmin: boolean): Promise<Role> {
    const role: Role = asAdmin ? 'admin' : 'member';
    try {
      await setDoc(memberRef(), { role, code, joinedAt: Date.now() });
    } catch {
      throw new Error('コードが違います');
    }
    return role;
  }

  async changeCodes(memberCode: string, adminCode: string) {
    await setDoc(secretRef(), { memberCode, adminCode });
    await setDoc(memberRef(), { role: 'admin', code: adminCode, joinedAt: Date.now() });
  }

  async leave() {
    await deleteDoc(memberRef());
  }
}
